/**
 * v0 — read the captured event log and answer the open questions.
 *
 * Prints how many of each event type were seen, then dumps full sample payloads for the
 * events v1 and v2 depend on, so we can see their real shape.
 *
 * See docs/07-open-questions.md, questions 1 and 2.
 *
 * Usage:
 *   bun run analyze                        # counts + samples of the interesting events
 *   bun run analyze -- --type session.idle # full samples of one type
 *   bun run analyze -- --samples 5         # how many samples to print per type
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS_DIR } from "../config.ts";

/** Event types that decide the v1 and v2 design. Matched loosely, since names are unconfirmed. */
const INTERESTING = /permission|idle|error|compact|finish|abort|question/i;

interface Row {
  at: string;
  type: string;
  event: unknown;
}

function parseArgs(argv: string[]): { type?: string; samples: number } {
  let type: string | undefined;
  let samples = 3;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--type" && argv[i + 1]) type = argv[++i];
    if (argv[i] === "--samples" && argv[i + 1]) samples = Number(argv[++i]) || 3;
  }
  return { type, samples };
}

function loadRows(): Row[] {
  let files: string[];
  try {
    files = readdirSync(EVENTS_DIR).filter((f) => f.startsWith("events-") && f.endsWith(".jsonl"));
  } catch {
    console.error(`No events directory at ${EVENTS_DIR}.`);
    console.error("Run 'bun run listen' first, and use OpenCode for a while.");
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("No event log files found. Run 'bun run listen' first.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const file of files) {
    const text = readFileSync(join(EVENTS_DIR, file), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        rows.push(JSON.parse(line) as Row);
      } catch {
        // A partial last line is normal if the logger was killed mid-write. Skip it.
      }
    }
  }
  return rows;
}

function main(): void {
  const { type: only, samples } = parseArgs(process.argv.slice(2));
  const rows = loadRows();

  console.log(`${rows.length} events from ${rows[0]?.at ?? "?"} to ${rows.at(-1)?.at ?? "?"}\n`);

  // Counts, most frequent first.
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);

  console.log("EVENT TYPES");
  for (const [type, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const mark = INTERESTING.test(type) ? " <-- matters for v1/v2" : "";
    console.log(`  ${String(n).padStart(6)}  ${type}${mark}`);
  }

  // Full payloads for the types we need to design against.
  const targets = only
    ? [only]
    : [...counts.keys()].filter((t) => INTERESTING.test(t));

  if (targets.length === 0) {
    console.log("\nNo events matching the interesting set were captured.");
    console.log("That usually means the session never went idle and never asked permission.");
    console.log("Use OpenCode for a real task, let it finish, and let it ask for approval.");
    return;
  }

  for (const type of targets) {
    const matching = rows.filter((r) => r.type === type);
    console.log(`\n${"=".repeat(70)}\n${type}  (${matching.length} seen)\n${"=".repeat(70)}`);
    for (const row of matching.slice(0, samples)) {
      console.log(JSON.stringify(row.event, null, 2));
      console.log("-".repeat(70));
    }
  }

  console.log("\nRecord what you learned in docs/06-research.md, then update");
  console.log("docs/07-open-questions.md and LOG.md.");
}

if (import.meta.main) main();
