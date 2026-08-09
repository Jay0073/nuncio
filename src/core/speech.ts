/**
 * Turn a report into chunks with the pauses a person would leave.
 *
 * Uniform sentence-by-sentence gaps sound like a metronome. Real speech pauses where the
 * meaning changes and where the listener needs a beat to catch up. Two signals give us that
 * without any analysis:
 *
 * 1. **Field boundaries are topic changes.** Going from `did` to `decision` to `ask` is a new
 *    subject. That earns a real pause.
 * 2. **Density earns a beat.** A 25-word sentence takes more taking-in than a 6-word one, so
 *    the pause after it should be longer.
 *
 * This matters more than it looks. The owner is not a native English speaker and reads in
 * bursts — read, pause, think, read on. A continuous stream at one pace is the thing that
 * breaks comprehension, and it is not fixed by a nicer voice.
 *
 * These numbers are a starting point. Expect to tune them after hearing it.
 */

import { splitSentences } from "./budget.ts";
import type { Segment } from "../report-contract.ts";

/** A new subject. Long enough to notice, short enough not to feel broken. */
const FIELD_PAUSE_MS = 800;

/** The floor for a pause between sentences inside one thought. Barely more than natural. */
const SENTENCE_BASE_MS = 150;

/** Added per word of the sentence just spoken, so dense sentences get a longer beat. */
const MS_PER_WORD = 15;

/** Above this it stops feeling like a breath and starts feeling like a fault. */
const SENTENCE_MAX_MS = 450;

export interface Chunk {
  text: string;
  /** Silence after this chunk, in milliseconds. */
  pauseAfterMs: number;
  /** Which block field this came from. Used for display and for grouping. */
  field: string;
}

/**
 * Split segments into sentence-sized chunks and work out the pause after each.
 *
 * The last chunk gets no pause — the silence at the end is the report being over.
 */
/**
 * A sentence longer than this cannot be held in the head, and it also cannot be split by the
 * budget — so one runaway sentence swallows the whole report.
 *
 * Seen for real: asked to review a function, the agent wrote all eight findings as a single
 * 62-word comma list. It did not fit the budget, so every finding was pushed to "More" and the
 * spoken half was three sentences of preamble and nothing else.
 */
const MAX_CHUNK_WORDS = 28;

/**
 * Break a runaway sentence at its comma and semicolon joints.
 *
 * Not as good as the agent writing separate sentences — the contract now asks for that — but
 * this is the backstop for when it does not.
 */
export function splitLong(sentence: string, maxWords = MAX_CHUNK_WORDS): string[] {
  if (countWords(sentence) <= maxWords) return [sentence];

  // Keep the separators attached to the piece they end, so it still reads naturally.
  const pieces = sentence.split(/(?<=[;,])\s+/).filter(Boolean);
  if (pieces.length === 1) return [sentence];

  const out: string[] = [];
  let current = "";

  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (current && countWords(candidate) > maxWords) {
      out.push(current);
      current = piece;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function toChunks(segments: Segment[]): Chunk[] {
  const chunks: Chunk[] = [];

  segments.forEach((segment, segmentIndex) => {
    const sentences = splitSentences(segment.text).flatMap((s) => splitLong(s));
    const lastSegment = segmentIndex === segments.length - 1;

    sentences.forEach((sentence, sentenceIndex) => {
      const lastSentence = sentenceIndex === sentences.length - 1;
      const words = sentence.split(/\s+/).filter(Boolean).length;

      let pauseAfterMs: number;
      if (lastSegment && lastSentence) pauseAfterMs = 0;
      else if (lastSentence) pauseAfterMs = FIELD_PAUSE_MS;
      else pauseAfterMs = Math.min(SENTENCE_MAX_MS, SENTENCE_BASE_MS + words * MS_PER_WORD);

      chunks.push({ text: sentence, pauseAfterMs, field: segment.field });
    });
  });

  return chunks;
}

/**
 * Drop chunks from the held-back part that repeat something already spoken.
 *
 * Real reports restate: the model puts a point in `did` and then says it again in `decision`.
 * When the budget cuts between them, the "More" half opens by repeating what you just heard,
 * which is exactly what the owner reported.
 *
 * The contract now forbids repeating, but instructions are not enough — this is the backstop.
 */
export function dropRepeats(spoken: Chunk[], rest: Chunk[]): Chunk[] {
  const seen = spoken.map(fingerprint);
  return rest.filter((chunk) => {
    const print = fingerprint(chunk);
    return !seen.some((earlier) => overlap(earlier, print) >= REPEAT_THRESHOLD);
  });
}

/**
 * How much overlap counts as a repeat.
 *
 * Deliberately high. Dropping something the listener has not heard is worse than letting a
 * near-repeat through — they can ignore a repeat, but they cannot recover a sentence that was
 * silently deleted.
 */
const REPEAT_THRESHOLD = 0.8;

/** Below this there is too little signal to call anything a repeat. */
const MIN_TOKENS = 3;

/**
 * Content words, lowercased.
 *
 * Numbers are kept deliberately. "Three tests failed" and "Two tests failed" share every word
 * except the number — dropping the numbers made them identical, and the second would have been
 * silently deleted. The number is often the only thing that differs and the only thing that
 * matters.
 */
function fingerprint(chunk: Chunk): Set<string> {
  return new Set(
    chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3 || /^\d+$/.test(word)),
  );
}

/** Fraction of the smaller set that appears in the larger one. */
function overlap(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size < MIN_TOKENS) return 0;
  let shared = 0;
  for (const word of smaller) if (larger.has(word)) shared++;
  return shared / smaller.size;
}

export function chunkWords(chunks: Chunk[]): number {
  return chunks.reduce((n, c) => n + countWords(c.text), 0);
}

/** Progress lines are heard while you wait. Long enough to mean something, short enough to skim. */
const PROGRESS_MAX_WORDS = 34;

/**
 * Turn a mid-turn text part into one line worth hearing.
 *
 * The agent writes these for the screen, so they carry markdown, bullet lists and file paths.
 * Only the opening sentences say what is happening; the rest is detail you can read later.
 *
 * Returns null when there is nothing worth saying.
 */
export function progressLine(text: string): string | null {
  const flat = text
    // Whole fenced blocks, not just the fence lines — otherwise the code inside gets spoken.
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .split("\n")
    // Bullet lists, tables and headings are detail, not narration.
    .filter((line) => !/^\s*([-*+]\s|\d+\.\s|\||#)/.test(line))
    .join(" ")
    .replace(/`+/g, "")
    .replace(/\*\*?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flat.length === 0) return null;

  const sentences = splitSentences(flat);
  const kept: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const length = countWords(sentence);
    if (kept.length > 0 && words + length > PROGRESS_MAX_WORDS) break;
    kept.push(sentence);
    words += length;
    if (words >= PROGRESS_MAX_WORDS) break;
  }

  const line = kept.join(" ").trim();
  return line.length > 0 ? line : null;
}

export function chunkText(chunks: Chunk[]): string {
  return chunks.map((c) => c.text).join(" ");
}
