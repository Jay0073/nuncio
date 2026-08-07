/**
 * Shared configuration.
 *
 * All paths are resolved from the current working directory, so every script must be run
 * from the project root. The bun scripts in package.json do that already.
 */

import { join } from "node:path";

/** Where `opencode serve` is listening. Override with the OPENCODE_URL environment variable. */
export const BASE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096";

/** Captured event logs and test output. Git-ignored. */
export const EVENTS_DIR = join(process.cwd(), "events");

/** One log file per day, so a long capture stays readable. */
export function eventLogPath(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return join(EVENTS_DIR, `events-${day}.jsonl`);
}
