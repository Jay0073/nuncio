/**
 * The speech budget.
 *
 * A cap that lives only in a prompt is not a cap. Real blocks in the v0 and v1 capture ran from
 * 10 to 431 words against a stated maximum of 120, and nuncio spoke whatever it was handed.
 *
 * So the daemon enforces it. It speaks down to the budget, cutting on a sentence boundary, and
 * keeps the remainder. "More" reads the remainder out of memory — no CLI call, no tokens, no
 * latency, and it cannot drift from what the agent actually said (D-024).
 *
 * Track EAR L3, pulled forward from v4 because real use showed the cap was doing nothing.
 */

/**
 * How many words to speak before offering the rest.
 *
 * Scaled by the work actually done in the turn, using the `file.edited` events nuncio already
 * has. A turn that touched nothing does not earn 100 words. A turn that rewrote six files does.
 */
export function budgetFor(filesChanged: number): number {
  if (filesChanged === 0) return 45;
  if (filesChanged <= 3) return 70;
  return 100;
}

export interface Trimmed {
  /** What to speak now. */
  spoken: string;
  /** What was held back. Empty when nothing was cut. */
  rest: string;
}

/**
 * Cut text to a word budget on a sentence boundary.
 *
 * Never cuts mid-sentence — a clipped sentence sounds broken and loses the meaning of the part
 * you did hear. If the very first sentence already exceeds the budget it is kept whole, because
 * speaking half of it is worse than running slightly long.
 *
 * A small overshoot is allowed rather than dropping a sentence that nearly fits: cutting a
 * 48-word report to 30 to satisfy a 45-word budget serves nobody.
 */
export function trimToBudget(text: string, budget: number): Trimmed {
  const clean = text.trim();
  if (clean === "") return { spoken: "", rest: "" };
  if (countWords(clean) <= budget) return { spoken: clean, rest: "" };

  const sentences = splitSentences(clean);
  const kept: string[] = [];
  let words = 0;

  for (const sentence of sentences) {
    const length = countWords(sentence);
    if (kept.length > 0 && words + length > budget) break;
    kept.push(sentence);
    words += length;
    // The first sentence is always kept whole, even if it alone blows the budget.
    if (words >= budget) break;
  }

  const spoken = kept.join(" ").trim();
  const rest = clean.slice(spoken.length).trim();
  return rest === "" ? { spoken: clean, rest: "" } : { spoken, rest };
}

/**
 * Split on sentence ends, keeping the punctuation.
 *
 * A full stop only ends a sentence when whitespace follows it. That one check is what stops
 * "index.ts" and ".git folders" from being cut in half — models put those in reports despite
 * the contract asking them not to.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
