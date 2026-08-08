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

import { parseSpeakBlock, renderForSpeech, wordCount } from "../report-contract.ts";
import { budgetFor, trimToBudget } from "./budget.ts";

export interface Report {
  /** What gets spoken now. Already trimmed to the budget. */
  text: string;
  /** What was held back. Empty when nothing was cut. "More" reads this from memory (D-024). */
  rest: string;
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
    const full = renderForSpeech(block);
    const { spoken, rest } = trimToBudget(full, budgetFor(files.length));
    return {
      text: spoken,
      rest,
      source: "block",
      needsYou: block.ask !== undefined,
      files,
      ...(rest ? { fullWords: wordCount(full) } : {}),
    };
  }

  return { text: fallbackText(files), rest: "", source: "fallback", needsYou: false, files };
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
