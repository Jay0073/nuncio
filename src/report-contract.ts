/**
 * The spoken report contract.
 *
 * This is the whole speak-layer in v1. The agent writes a short spoken summary of its turn and
 * marks it. nuncio speaks only what was marked. No classifier, no model, no guessing.
 *
 * See docs/02-tracks.md Track REPORT L1, and docs/05-decisions.md D-006 and D-020.
 *
 * IMPORTANT — what this is not.
 * This is not a persona and not a character. It does not tell the agent how to work, how to
 * plan, when to ask questions, or how to code. It only says how the spoken summary is written.
 * The agent's normal on-screen response is untouched. See D-020.
 */

export const SPEAK_OPEN = "<<SPEAK>>";
export const SPEAK_CLOSE = "<<END>>";

/** The keys the block may contain, in the order they should be spoken. */
export const SPEAK_KEYS = ["did", "decision", "ask"] as const;
export type SpeakKey = (typeof SPEAK_KEYS)[number];

export type SpeakBlock = Partial<Record<SpeakKey, string>>;

/** Above this, the report is too long to listen to. Track EAR L3 turns this into a real budget. */
export const MAX_WORDS = 120;

export const STEP_OPEN = "<<STEP>>";

/**
 * The optional progress-marker section.
 *
 * Kept separate so its cost can be measured. `bun run model-test -- --compare` runs the
 * contract with and without it and reports how often each still produces a valid final block.
 * Do not enable it on a hunch — enable it on a number.
 */
const STEP_SECTION = `

## While you work

As you go, write a single line at each real milestone:

${STEP_OPEN} what you just found or just did, one short sentence

A milestone is: you understood the problem, you found the cause, you finished a piece, you got
blocked, or you started something that will take a while. Not every file read. Three or four
per turn at most.

These are spoken while I wait, so I can follow along instead of hearing nothing for ten
minutes. Same style rules as the report below.`;

const CONTRACT_BODY = `# Spoken report

At the end of every turn, after your normal response, add this block:

${SPEAK_OPEN}
did: what happened, in order, with the real names
decision: a choice you made that I might disagree with, and why
ask: a question you need answered, with the options
${SPEAK_CLOSE}

A text-to-speech engine reads this block aloud. I may be away from the screen when it does.
Your normal response stays on screen exactly as you would write it. This block is extra, and it
is the only part that is spoken.

## What to write

Write what a colleague would tell me if I walked up and asked how it went. Not "it is done".
Not the whole transcript. The parts I would actually want to hear.

Name real things. Say which function, which file, which test. "Two tests broke" is weaker than
"the hourly grouping test failed and the summary test errored".

Include what came up along the way: what failed, what surprised you, what you had to work
around. That belongs in \`did\` — it is part of what happened.

## How much to say

Length follows **what I asked for**, not how long you worked.

- **I asked a question, or asked you to explain, review or compare something.**
  The report IS the answer, spoken. Do not describe that you answered — give the answer
  itself. This is usually your longest report.

- **I asked you to change something.**
  What you changed, what broke or surprised you, what you decided, and where it ended up.

- **The turn was small.** One file read, one small edit, a yes or no.
  One sentence.

**Never narrate the kind of turn it was.** Do not write "I answered your question", "I did not
run any tools", "As requested", "Here is what I did". Start with the content.

**Do not compress what is already short.** If your on-screen response was already brief, the
report should carry nearly all of it, rewritten to be heard rather than read. Summarising a
summary loses the specifics, and the specifics are the part worth hearing.

**Put the most important thing first.** A listener cannot skim. If only the first sentence gets
heard, it should still be the sentence that matters most.

This is the target for a change-something turn:

  did: I removed groupCommitsByHour from the grouping module to see what depended on it.
  Two tests broke, the hourly grouping test failed and the summary test errored because it
  reaches that function through formatDigest. So the dependency is not isolated. I put it
  back, all 20 tests pass and the type check is clean.
  decision: I left formatDigest alone rather than splitting it now, because that is a bigger
  change than you asked for.

## How to write it

- Plain spoken English. Short sentences. Facts in the order they happened.
- No markdown, no code blocks, no bullet points, no backticks.
- File names only, never full paths. Say "package.json", not the whole directory.
- Numbers instead of adjectives. "20 tests pass", not "the tests pass nicely".
- No padding. Never "I have successfully completed" or "Let me explain what I did".
- Write in the first person. You and the voice reading this out are the same colleague.
- Stay under ${MAX_WORDS} words. Only an explanation turn should come close to that.

## Rules

- Always add the block. Even for a small turn. Even if you only answered a question.
- Include only the lines that apply. If a line does not apply, LEAVE IT OUT COMPLETELY.
  Never write "none", "N/A", "nothing", or a dash. Those get spoken aloud and sound wrong.
- At least one line must be present.
- Put the block at the very end. Write nothing after ${SPEAK_CLOSE}.`;

export interface ContractOptions {
  /** Ask for `<<STEP>>` progress lines during the turn. Off until measured. */
  steps?: boolean;
}

export function buildContract(options: ContractOptions = {}): string {
  return options.steps ? CONTRACT_BODY + STEP_SECTION : CONTRACT_BODY;
}

export const REPORT_CONTRACT = buildContract();

/** Pull the progress lines out of a partial response. */
export function parseSteps(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const index = line.indexOf(STEP_OPEN);
    if (index === -1) continue;
    const content = line.slice(index + STEP_OPEN.length).trim();
    if (content) found.push(content);
  }
  return found;
}

const KEY_LINE = new RegExp(`^\\s*(${SPEAK_KEYS.join("|")})\\s*:\\s*(.*)$`, "i");

/**
 * Values that mean "this line does not apply".
 *
 * Models write these instead of leaving the line out, even when told not to. Observed on the
 * first real run: a model emitted `ask: none`, which would have been spoken as the word "none"
 * at the end of the report. Filter them here rather than trusting the instruction.
 */
const FILLER = /^(none|n\/?a|nothing|no|null|nil|-{1,2}|—|\.)\s*\.?$/i;

/**
 * Pull the block out of an assistant response.
 *
 * Returns null when there is no block, or when the block contains no usable keys. The caller
 * must handle null — see D-013. Never fall back to speaking the raw response.
 *
 * If a model emits more than one block, the last one wins. That is the one written after the
 * work was finished.
 */
export function parseSpeakBlock(text: string): SpeakBlock | null {
  const start = text.lastIndexOf(SPEAK_OPEN);
  if (start === -1) return null;

  const afterOpen = start + SPEAK_OPEN.length;
  const end = text.indexOf(SPEAK_CLOSE, afterOpen);
  // A missing close tag is common when a model runs out of tokens. Take the rest of the text
  // rather than throwing the report away.
  const body = text.slice(afterOpen, end === -1 ? undefined : end);

  const block: SpeakBlock = {};
  let lastKey: SpeakKey | null = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const match = KEY_LINE.exec(line);
    if (match) {
      const key = match[1]!.toLowerCase() as SpeakKey;
      block[key] = match[2]!.trim();
      lastKey = key;
      continue;
    }

    // A wrapped continuation of the previous line. Join it back on.
    if (lastKey && block[lastKey] !== undefined) {
      block[lastKey] = `${block[lastKey]} ${line}`.trim();
    }
  }

  for (const key of SPEAK_KEYS) {
    const value = block[key];
    if (value === undefined) continue;
    if (value === "" || FILLER.test(value)) delete block[key];
  }

  return Object.keys(block).length > 0 ? block : null;
}

/** Remove the block from the text that stays on screen. */
export function stripSpeakBlock(text: string): string {
  const start = text.lastIndexOf(SPEAK_OPEN);
  if (start === -1) return text;
  const end = text.indexOf(SPEAK_CLOSE, start);
  const tail = end === -1 ? "" : text.slice(end + SPEAK_CLOSE.length);
  return (text.slice(0, start) + tail).trimEnd();
}

/**
 * Turn a block into one piece of text ready for a speech engine.
 *
 * Markdown and backticks are stripped here as well as forbidden in the instruction, because
 * models emit them anyway and a spoken asterisk is worse than a missed one.
 */
export function renderForSpeech(block: SpeakBlock): string {
  const parts: string[] = [];
  if (block.did) parts.push(block.did);
  if (block.decision) parts.push(`One decision: ${block.decision}`);
  if (block.ask) parts.push(block.ask);

  return parts
    .map(clean)
    .map((p) => (/[.?!]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

function clean(text: string): string {
  return text
    .replace(/`+/g, "")
    .replace(/\*\*?/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
