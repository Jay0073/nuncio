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

## The one rule that matters

**Write it for someone who has not seen your response, has not seen the code, and does not
remember this project.** That is me. I have not been watching. I did not read the file you
read. I do not know what the error was. I only know what I asked for.

So never mention a thing without naming it first.

"Fixed the wrong data issues. All 20 tests pass." tells me nothing. I do not know there were
data issues, which file they were in, what was actually wrong, or why it mattered. That is a
receipt, not an explanation.

If you find yourself writing "the issue", "the bug", "the function", or "it" without having
said which one — stop and name it.

## did — the main line

Answer these three in order, written as one flowing piece of speech, not as a list:

1. **What this is about.** Name the thing. Say where it lives and why it mattered. Assume I
   know nothing about it.
2. **What you found, and what you did.** The specifics — which function, which test, what
   broke.
3. **Where it ended up.** Numbers.

The target:

  did: The digest was showing dates a day off for evening commits. Three places in the
  formatter assumed UTC while git log returns local time, so anything after 6pm landed on the
  wrong day. I converted all three and added a test for the evening case. All 20 tests pass.

Compare that with "Fixed the date issues, tests pass." Same turn. One of them lets me
understand without looking at the screen. That is the whole job.

## How much to say

Length follows **what I asked for**, not how long you worked.

- **I asked you to review, audit, or find problems.**
  The findings **are** the report. Name each one: where it is, what is wrong, and why it
  matters. Do not tell me how many you found — tell me what they are. Counting them is
  useless to someone who cannot see the list. This is your longest report, and that is correct.

  **Give each finding its own sentence.** Never a comma-separated list. I cannot hold seven
  items from one long sentence in my head, and a sentence I cannot finish is a sentence I did
  not hear.

  Not this:
    did: Eight problems: the since parameter is dead, the empty object fails type checking,
    getUTCHours groups by UTC, numeric keys sort wrongly, empty hours are missing...

  This:
    did: The since parameter is declared but never used. The result object is typed as empty,
    so indexing it by number fails the type check. It groups by UTC hours while the rest of
    the app formats in local time, so commits can land in the wrong bucket.

- **I asked a question, or asked you to explain or compare something.**
  The report IS the answer, spoken. Do not describe that you answered — give the answer
  itself.

- **I asked you to change something.**
  What it was, what you found, what you changed, and where it ended up.

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

- **Simple English. I am not a native speaker, and I am listening, not reading — I cannot go
  back over a sentence I missed.** Use common words. Say "use" not "utilise", "so" not
  "consequently", "start" not "initiate". One idea per sentence. No idioms.
- Plain spoken English. Short sentences. Facts in the order they happened.
- No markdown, no code blocks, no bullet points, no backticks.
- File names only, never full paths. Say "package.json", not the whole directory.
- Numbers instead of adjectives. "20 tests pass", not "the tests pass nicely".
- No padding. Never "I have successfully completed" or "Let me explain what I did".
- Write in the first person. You and the voice reading this out are the same colleague.
- Stay under ${MAX_WORDS} words. Only an explanation turn should come close to that.

## Rules

- Always add the block. Even for a small turn. Even if you only answered a question.
- **Never say the same thing twice.** If it is already in \`did\`, it does not go in
  \`decision\` as well. I hear the whole thing in order, so a repeat is just wasted time.
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
 * The placeholder text from the template itself.
 *
 * A model that copies the skeleton instead of filling it in produces a block that parses
 * perfectly and says nothing. Speaking "what happened, in order, with the real names" aloud
 * would be worse than saying nothing at all, so these are treated as empty.
 */
const TEMPLATE = [
  /^what happened,? in order/i,
  /^a choice (you|i) made/i,
  /^a question (you|i) need/i,
  /^what this (is )?(about|concerns)/i,
];

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
    if (value === "" || FILLER.test(value) || TEMPLATE.some((p) => p.test(value))) {
      delete block[key];
    }
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

export interface Segment {
  field: SpeakKey;
  text: string;
}

/**
 * Split a block into its fields, ready for speech.
 *
 * Kept as separate segments rather than one joined string because the field boundaries are
 * where a real pause belongs — they are topic changes. Sentences inside one field are one
 * continuous thought and should barely pause. See `src/core/speech.ts`.
 *
 * Markdown and backticks are stripped here as well as forbidden in the instruction, because
 * models emit them anyway and a spoken asterisk is worse than a missed one.
 */
export function renderSegments(block: SpeakBlock): Segment[] {
  const segments: Segment[] = [];

  const add = (field: SpeakKey, text: string | undefined, prefix = ""): void => {
    if (!text) return;
    const cleaned = clean(prefix + text);
    if (cleaned) segments.push({ field, text: /[.?!]$/.test(cleaned) ? cleaned : `${cleaned}.` });
  };

  add("did", block.did);
  add("decision", block.decision, "One decision: ");
  add("ask", block.ask);
  return segments;
}

/** The whole block as one string. Used for display and for measuring length. */
export function renderForSpeech(block: SpeakBlock): string {
  return renderSegments(block)
    .map((s) => s.text)
    .join(" ");
}

/**
 * Directory paths, reduced to the file name.
 *
 * The contract asks for file names only, and the model still wrote "src/lib/group.ts". Spoken,
 * that is "source slash lib slash group dot t s" — three quarters of it noise.
 *
 * Only fires when the last segment looks like a real file name, so "and/or" and dates survive.
 */
const PATH = /\b[\w.@:-]+(?:[\\/][\w.@-]+)*[\\/]([\w-]+\.[A-Za-z][\w]*)\b/g;

function clean(text: string): string {
  return text
    .replace(PATH, "$1")
    .replace(/`+/g, "")
    .replace(/\*\*?/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
