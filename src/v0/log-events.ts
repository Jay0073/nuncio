/**
 * v0 — the Listening Post.
 *
 * Connects to `opencode serve` and writes every event to a JSONL file, one JSON object per
 * line. Run it, then use OpenCode normally for a full day, then run `bun run analyze`.
 *
 * The point is to stop guessing. We do not know what `session.idle` contains, or whether
 * `permission.asked` carries the option list. Everything in v1 and v2 depends on that, so we
 * measure it instead of reading documentation.
 *
 * See docs/03-versions.md, v0.
 *
 * Usage:
 *   opencode serve            # in another terminal
 *   bun run listen
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { BASE_URL, EVENTS_DIR, eventLogPath } from "../config.ts";

const counts = new Map<string, number>();
let total = 0;

function record(event: unknown): void {
  const type = typeOf(event);
  counts.set(type, (counts.get(type) ?? 0) + 1);
  total++;

  const line = JSON.stringify({ at: new Date().toISOString(), type, event });
  appendFileSync(eventLogPath(), line + "\n", "utf8");

  console.log(`${new Date().toLocaleTimeString()}  ${type.padEnd(28)} ${hint(event)}`);
}

/** Event shape is not guaranteed, so read the type defensively. */
function typeOf(event: unknown): string {
  if (event && typeof event === "object" && "type" in event) {
    const t = (event as { type: unknown }).type;
    if (typeof t === "string") return t;
  }
  return "unknown";
}

/** A short one-line preview so the live output stays readable. */
function hint(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const props = (event as { properties?: unknown }).properties;
  if (props === undefined) return "";
  const text = JSON.stringify(props);
  return text.length > 110 ? text.slice(0, 110) + "…" : text;
}

function printSummary(): void {
  console.log(`\n--- ${total} events captured ---`);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, n] of rows) {
    console.log(`  ${String(n).padStart(6)}  ${type}`);
  }
  console.log(`\nWritten to ${eventLogPath()}`);
  console.log("Next: bun run analyze");
}

async function main(): Promise<void> {
  mkdirSync(EVENTS_DIR, { recursive: true });

  process.on("SIGINT", () => {
    printSummary();
    process.exit(0);
  });

  let failures = 0;

  // The stream will drop — the server restarts, the laptop sleeps, the network blips. This
  // runs all day, so reconnect rather than die.
  for (;;) {
    try {
      const client = createOpencodeClient({ baseUrl: BASE_URL });
      const events = await client.event.subscribe();
      failures = 0;
      console.log(`Connected to ${BASE_URL}. Writing to ${eventLogPath()}.`);
      console.log("Use OpenCode normally. Press Ctrl+C to stop and see the summary.\n");

      for await (const event of events.stream) {
        record(event);
      }

      console.log("Stream closed by the server.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Connection failed: ${message}`);
      console.error(`Is 'opencode serve' running on ${BASE_URL}?`);
    }

    failures++;
    const waitMs = Math.min(30_000, 1000 * 2 ** failures);
    console.log(`Reconnecting in ${waitMs / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

if (import.meta.main) await main();
