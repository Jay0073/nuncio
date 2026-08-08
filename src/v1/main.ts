/**
 * v1 — The Report.
 *
 * Desk only. Output only. You keep typing in the TUI; nuncio does not touch your input.
 *
 * When a turn finishes, nuncio plays a tone. When you are ready, you click Listen and it
 * speaks the summary the agent wrote. It never speaks unless you opened the channel.
 *
 * See docs/03-versions.md, v1.
 *
 * Usage:
 *   cd <your project> && opencode serve --port 4096
 *   bun run v1                       # then open the printed URL
 *   opencode attach http://localhost:4096
 */

import { OpenCodeAdapter } from "../adapters/opencode.ts";
import type { NormalizedEvent } from "../core/events.ts";
import { initialState, reduce, type Input, type NuncioState } from "../core/state.ts";
import { startServer } from "../server/serve.ts";
import { BASE_URL } from "../config.ts";

const PORT = Number(process.env.NUNCIO_PORT ?? 4747);
const HOSTNAME = process.env.NUNCIO_HOST ?? "127.0.0.1";

let state: NuncioState = initialState;

function apply(input: Input): void {
  const before = state;
  state = reduce(state, input, Date.now());
  if (state !== before) {
    log(input, state);
    server.broadcast(state);
  }
}

const adapter = new OpenCodeAdapter(BASE_URL);

const server = startServer({
  port: PORT,
  hostname: HOSTNAME,
  getState: () => state,
  onUiEvent: apply,
});

function log(input: Input, next: NuncioState): void {
  const time = new Date().toLocaleTimeString();
  const head = next.queue[0];
  const queued = next.queue.length > 1 ? ` (+${next.queue.length - 1} queued)` : "";
  const detail = head ? `  [${head.report.source}] ${head.report.text.slice(0, 80)}` : "";
  const more = head?.report.rest ? `  (+${head.report.fullWords} words held)` : "";
  console.log(`${time}  ${input.kind.padEnd(22)} -> ${next.state}${queued}${detail}${more}`);
}

async function main(): Promise<void> {
  console.log("nuncio v1 — The Report\n");

  // D-019: without a git repo, OpenCode reports the "global" project, the project config is
  // never loaded, and permission settings silently do nothing. Warn instead of failing quietly.
  const project = await adapter.checkProject();
  if (!project.ok) {
    console.warn(`WARNING: OpenCode is not rooted in a project (worktree: ${project.worktree}).`);
    console.warn("Start 'opencode serve' from inside a git repository, or run 'git init' there.");
    console.warn("Permission settings will not apply until you do.\n");
  } else {
    console.log(`Project:  ${project.worktree}`);
  }

  console.log(`OpenCode: ${BASE_URL}`);
  console.log(`nuncio:   ${server.url}   <- open this, then press "Enable sound"\n`);

  process.on("SIGINT", () => {
    void adapter.stop();
    server.stop();
    process.exit(0);
  });

  await adapter.start((event: NormalizedEvent) => apply(event));
}

if (import.meta.main) await main();
