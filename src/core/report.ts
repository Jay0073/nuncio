/**
 * Build the text that gets spoken when a turn finishes.
 *
 * Two sources, in order of preference:
 *
 * 1. The <<SPEAK>> block the agent wrote. This is the normal path.
 * 2. A fallback built from `file.edited` events, when the block is missing. See D-013.
 *
 * The fallback must NEVER be the raw response. Speaking the raw response is the dumb-narration
 * failure mode this whole project exists to avoid. A thin, honest report that tells you to look
 * at the screen is better than two minutes of markdown read aloud.
 */

import { parseSpeakBlock, renderSegments, wordCount } from "../report-contract.ts";
import { budgetFor } from "./budget.ts";
import { chunkText, chunkWords, dropRepeats, toChunks, type Chunk } from "./speech.ts";

export interface Report {
  /** What gets spoken now, as one string. For display and for tests. */
  text: string;
  /** What gets spoken now, in chunks with the pause after each. This is what the page plays. */
  chunks: Chunk[];
  /** Held back by the budget. Empty when nothing was cut. "More" reads this (D-024). */
  rest: string;
  restChunks: Chunk[];
  source: "block" | "fallback" | "permission" | "question" | "error";
  /** True when the agent is stopped until you answer. Drives the "needs you" ping. */
  needsYou: boolean;
  /** File names touched this turn. Shown on screen, not spoken. */
  files: string[];
  /** The block's full length in words, when it ran past the budget. Tuning signal. */
  fullWords?: number;
}

export function buildReport(text: string | null, filePaths: string[]): Report {
  const files = [...new Set(filePaths.map(fileName))];

  const block = text ? parseSpeakBlock(text) : null;
  if (block) {
    const all = toChunks(renderSegments(block));
    const { spoken, rest } = splitAtBudget(all, budgetFor(files.length));
    // The contract forbids repeating across lines, but instructions are not enough.
    const trimmedRest = dropRepeats(spoken, rest);

    return {
      text: chunkText(spoken),
      chunks: spoken,
      rest: chunkText(trimmedRest),
      restChunks: trimmedRest,
      source: "block",
      needsYou: block.ask !== undefined,
      files,
      ...(trimmedRest.length > 0 ? { fullWords: chunkWords(all) } : {}),
    };
  }

  return plain(fallbackText(files), "fallback", false, files);
}

/**
 * Cut a chunk list at a word budget.
 *
 * Never cuts mid-sentence, because the chunks are already whole sentences. The first chunk is
 * always kept even if it alone blows the budget — speaking half a thought is worse than
 * running slightly long.
 */
function splitAtBudget(chunks: Chunk[], budget: number): { spoken: Chunk[]; rest: Chunk[] } {
  let words = 0;
  let index = 0;

  for (const chunk of chunks) {
    const length = chunk.text.split(/\s+/).filter(Boolean).length;
    if (index > 0 && words + length > budget) break;
    words += length;
    index++;
    if (words >= budget) break;
  }

  const spoken = chunks.slice(0, index);
  const rest = chunks.slice(index);
  // Nothing gained by holding back a single trailing sentence.
  if (rest.length === 0) return { spoken: chunks, rest: [] };

  // The last spoken chunk now ends the spoken half, so it should not trail off into a pause.
  const last = spoken.at(-1);
  if (last) spoken[spoken.length - 1] = { ...last, pauseAfterMs: 0 };

  return { spoken, rest };
}

/** A one-piece report: a permission, a question, an error, or the fallback. */
export function plain(
  text: string,
  source: Report["source"],
  needsYou: boolean,
  files: string[] = [],
): Report {
  const chunks = toChunks([{ field: "did", text }]);
  const last = chunks.at(-1);
  if (last) chunks[chunks.length - 1] = { ...last, pauseAfterMs: 0 };
  return { text, chunks, rest: "", restChunks: [], source, needsYou, files };
}

/**
 * What to say when the agent did not write a block.
 *
 * It states the facts we actually know from events, then says plainly that there is no summary,
 * so the user knows to look at the screen instead of assuming nothing happened.
 */
function fallbackText(files: string[]): string {
  if (files.length === 0) {
    return "Finished, but no summary was given and no files changed. Check the screen.";
  }

  if (files.length === 1) {
    return `Finished. Changed ${files[0]}. No summary was given, so check the screen.`;
  }

  const named = files.slice(0, 3).join(", ");
  const more = files.length > 3 ? `, and ${files.length - 3} more` : "";
  return `Finished. Changed ${files.length} files: ${named}${more}. No summary was given, so check the screen.`;
}

/** Full paths are unpleasant to listen to. Windows and POSIX separators both appear. */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export { wordCount };
