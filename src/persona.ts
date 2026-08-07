/**
 * The <<SPEAK>> block contract.
 *
 * This is the whole speak-layer in v1. The agent decides what is worth hearing and marks it.
 * nuncio speaks only what was marked. No classifier, no model, no guessing.
 *
 * See docs/02-tracks.md, Track EAR L1, and docs/05-decisions.md D-006.
 *
 * The behavioural half of the intern persona (lead with outcomes, do not narrate steps) is
 * Track PERSONA L1 and belongs in v1. It is deliberately not here, so that the v0 model test
 * measures one thing only: can this model follow the block format reliably.
 */

export const SPEAK_OPEN = "<<SPEAK>>";
export const SPEAK_CLOSE = "<<END>>";

/** The keys the block may contain, in the order they should be spoken. */
export const SPEAK_KEYS = ["done", "decision", "blocked", "ask"] as const;
export type SpeakKey = (typeof SPEAK_KEYS)[number];

export type SpeakBlock = Partial<Record<SpeakKey, string>>;

export const PERSONA = `# Reporting contract

You are being listened to, not only read. A voice layer speaks a short report of each turn to
the developer, who may be away from the screen and doing something else.

At the end of EVERY turn, after your normal response, emit this block:

${SPEAK_OPEN}
done: what you finished
decision: a choice you made that the developer might disagree with
blocked: what stopped you
ask: a question you need answered, with the options in square brackets
${SPEAK_CLOSE}

Rules:
- Always emit the block. Even for a small turn. Even if you only answered a question.
- Include only the lines that apply and drop the rest. At least one line must be present.
- One sentence per line. No markdown, no code, no bullet points.
- Write it to be spoken aloud. Say "the auth middleware", not a full file path.
- Numbers help: "4 files changed", "12 tests pass".
- This is not a summary of your response. It is what a developer would want to hear from a
  colleague who just finished a task.
- Put the block at the very end. Write nothing after ${SPEAK_CLOSE}.`;

const KEY_LINE = new RegExp(`^\\s*(${SPEAK_KEYS.join("|")})\\s*:\\s*(.*)$`, "i");

/**
 * Pull the block out of an assistant response.
 *
 * Returns null when there is no block, or when the block contains no recognised keys. The
 * caller must handle null — see docs/05-decisions.md D-013. Never fall back to speaking the
 * raw response.
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

  // Drop keys the model emitted but left empty.
  for (const key of SPEAK_KEYS) {
    if (block[key] === "") delete block[key];
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

/** Turn a block into one piece of text ready for a speech engine. */
export function renderForSpeech(block: SpeakBlock): string {
  const parts: string[] = [];
  if (block.done) parts.push(block.done);
  if (block.decision) parts.push(`I decided: ${block.decision}`);
  if (block.blocked) parts.push(`I am blocked: ${block.blocked}`);
  if (block.ask) parts.push(block.ask);
  return parts
    .map((p) => (/[.?!]$/.test(p) ? p : `${p}.`))
    .join(" ");
}
