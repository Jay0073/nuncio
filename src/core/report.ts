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

import { MAX_WORDS, parseSpeakBlock, renderForSpeech, wordCount } from "../report-contract.ts";

export interface Report {
  text: string;
  source: "block" | "fallback" | "permission" | "question" | "error";
  /** True when the agent is stopped until you answer. Drives the "needs you" ping. */
  needsYou: boolean;
  /** File names touched this turn. Shown on screen, not spoken. */
  files: string[];
  /** Set when the block ran past the length cap. Useful signal while tuning the contract. */
  overLength?: number;
}

export function buildReport(text: string | null, filePaths: string[]): Report {
  const files = filePaths.map(fileName);

  const block = text ? parseSpeakBlock(text) : null;
  if (block) {
    const spoken = renderForSpeech(block);
    const words = wordCount(spoken);
    return {
      text: spoken,
      source: "block",
      needsYou: block.ask !== undefined,
      files,
      ...(words > MAX_WORDS ? { overLength: words } : {}),
    };
  }

  return { text: fallbackText(files), source: "fallback", needsYou: false, files };
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

  const unique = [...new Set(files)];

  if (unique.length === 1) {
    return `Finished. Changed ${unique[0]}. No summary was given, so check the screen.`;
  }

  const named = unique.slice(0, 3).join(", ");
  const rest = unique.length > 3 ? `, and ${unique.length - 3} more` : "";
  return `Finished. Changed ${unique.length} files: ${named}${rest}. No summary was given, so check the screen.`;
}

/** Full paths are unpleasant to listen to. Windows and POSIX separators both appear. */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
