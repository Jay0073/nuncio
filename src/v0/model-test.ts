/**
 * v0 — measure whether a model can follow the <<SPEAK>> block contract.
 *
 * This is the second job of v0. The whole speak-layer in v1 depends on the agent emitting the
 * block at the end of every turn. Models vary a lot at following a format instruction on every
 * turn, so we measure it instead of assuming it.
 *
 * See docs/03-versions.md (v0) and docs/07-open-questions.md, question 3.
 *
 * Usage:
 *   opencode serve --port 4096
 *   bun run model-test                                       # OpenCode's default model
 *   bun run model-test -- --model opencode/big-pickle
 *   bun run model-test -- --model opencode/big-pickle --model opencode/claude-sonnet-5
 *   bun run model-test -- --runs 5
 *   bun run model-test -- --tools                            # task that needs a tool call
 *   bun run model-test -- --timeout 180
 *
 * Note on --tools: a task that calls a tool will trigger a permission request. In a headless
 * server with nothing answering permissions, that blocks forever. Do not use --tools until the
 * permission flow is understood. The default task needs no tools on purpose.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { BASE_URL, EVENTS_DIR } from "../config.ts";
import { PERSONA, parseSpeakBlock, renderForSpeech, type SpeakBlock } from "../persona.ts";

type Client = ReturnType<typeof createOpencodeClient>;

/** Needs no tools, so it cannot deadlock on a permission request. */
const DEFAULT_TASK =
  "In two sentences, explain what a JWT refresh token is and why it is used.";

/** Needs a tool call. Only safe once permission handling exists. See the note above. */
const TOOL_TASK =
  "Count how many files are in the current directory and tell me the number.";

interface Attempt {
  run: number;
  ok: boolean;
  ms: number;
  block: SpeakBlock | null;
  spoken: string;
  text: string;
  error?: string;
}

interface Options {
  runs: number;
  models: (string | undefined)[];
  task: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Options {
  let runs = 10;
  let task = DEFAULT_TASK;
  let timeoutMs = 120_000;
  const models: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1]) runs = Number(argv[++i]) || runs;
    if (argv[i] === "--task" && argv[i + 1]) task = argv[++i]!;
    if (argv[i] === "--model" && argv[i + 1]) models.push(argv[++i]!);
    if (argv[i] === "--timeout" && argv[i + 1]) timeoutMs = (Number(argv[++i]) || 120) * 1000;
    if (argv[i] === "--tools") task = TOOL_TASK;
  }

  // `undefined` means: send no model field, so OpenCode uses its configured default.
  return { runs, task, timeoutMs, models: models.length > 0 ? models : [undefined] };
}

/**
 * Redact anything that looks like a credential.
 *
 * The provider config contains live API keys. An earlier version of this script printed them
 * to the terminal. Never serialise server objects without passing them through this.
 */
const SECRET_KEY = /^(key|apikey|api_key|token|secret|password|authorization|auth)$/i;

/**
 * Not anchored. A key can appear in the middle of a sentence, inside an error message, or in a
 * URL. Only the matched token is replaced, so the surrounding text stays readable.
 */
const SECRET_VALUE = /\b(sk|pk|gho|ghp|ghs|xox|Bearer)[-_ ]?[A-Za-z0-9_-]{16,}/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[too deep]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[redacted]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * List the model IDs the account can use.
 *
 * This shells out to `opencode models` rather than reading the provider config over the API.
 * The config object contains live API keys; this output is just a list of IDs.
 */
async function listModels(): Promise<string[]> {
  try {
    const proc = Bun.spawn(["opencode", "models"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("/"));
  } catch {
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function toModelBody(model: string | undefined): Record<string, unknown> {
  if (!model) return {};
  const slash = model.indexOf("/");
  if (slash === -1) {
    throw new Error(`Model must be in providerID/modelID form. Got: ${model}`);
  }
  return {
    model: { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) },
  };
}

/**
 * Pull the assistant's text out of whatever shape the SDK returns.
 *
 * The exact response shape is one of the things v0 discovers, so this walks the object rather
 * than assuming a path. If it finds nothing, the raw response is written to disk so it can be
 * inspected by hand.
 */
function extractText(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((v) => extractText(v, depth + 1)).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (obj.type === "text" && typeof obj.text === "string") return obj.text;

    // Skip reasoning parts. They often contain a practice block, which would make a failing
    // model look like it passed.
    if (obj.type === "reasoning") return "";

    const collected: string[] = [];
    for (const key of ["data", "parts", "message", "content", "info", "text"]) {
      if (key in obj) {
        const found = extractText(obj[key], depth + 1);
        if (found) collected.push(found);
      }
    }
    return collected.join("\n");
  }

  return "";
}

function findSessionId(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value == null || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === "string") return obj.id;
  for (const key of ["data", "info", "session"]) {
    if (key in obj) {
      const found = findSessionId(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

async function runOnce(
  client: Client,
  model: string | undefined,
  task: string,
  run: number,
  timeoutMs: number,
): Promise<Attempt> {
  const started = Date.now();
  const fail = (error: string): Attempt => ({
    run,
    ok: false,
    ms: Date.now() - started,
    block: null,
    spoken: "",
    text: "",
    error,
  });

  try {
    const created = await withTimeout(
      client.session.create({ body: { title: `nuncio v0 model test run ${run}` } }),
      30_000,
      "session.create",
    );

    const sessionId = findSessionId(created);
    if (!sessionId) return fail("no session id in the create response");

    const response = await withTimeout(
      client.session.prompt({
        path: { id: sessionId },
        body: {
          ...toModelBody(model),
          parts: [{ type: "text", text: `${PERSONA}\n\n---\n\n${task}` }],
        },
      } as never),
      timeoutMs,
      "session.prompt",
    );

    const text = extractText(response);
    const block = parseSpeakBlock(text);

    return {
      run,
      ok: block !== null,
      ms: Date.now() - started,
      block,
      spoken: block ? renderForSpeech(block) : "",
      text,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function notesFor(attempts: Attempt[]): string {
  const errors = attempts.filter((a) => a.error).length;
  if (errors === attempts.length) return "every call failed";

  const withBlock = attempts.filter((a) => a.block);
  if (withBlock.length === 0) return "never emitted the block";

  const keys = new Set<string>();
  for (const a of withBlock) for (const k of Object.keys(a.block!)) keys.add(k);

  const done = attempts.filter((a) => !a.error);
  const median = done.length
    ? Math.round(done.map((a) => a.ms).sort((x, y) => x - y)[Math.floor(done.length / 2)]! / 1000)
    : 0;

  const parts = [`keys: ${[...keys].join(", ")}`, `median ${median}s`];
  if (errors > 0) parts.push(`${errors} failed`);
  return parts.join("; ");
}

async function main(): Promise<void> {
  const { runs, models, task, timeoutMs } = parseArgs(process.argv.slice(2));
  const client = createOpencodeClient({ baseUrl: BASE_URL });

  console.log("nuncio v0 — model reliability test");
  console.log(`Server:  ${BASE_URL}`);
  console.log(`Task:    ${task}`);
  console.log(`Runs:    ${runs} per model`);
  console.log(`Timeout: ${timeoutMs / 1000}s per run\n`);

  const available = await listModels();
  if (available.length > 0) {
    console.log(`${available.length} models available. Test one with --model <id>. For example:`);
    for (const id of available.slice(0, 5)) console.log(`  --model ${id}`);
    console.log("");
  }

  const results = new Map<string, Attempt[]>();

  for (const model of models) {
    const label = model ?? "(OpenCode default)";
    console.log(`=== ${label} ===`);
    const attempts: Attempt[] = [];

    for (let run = 1; run <= runs; run++) {
      process.stdout.write(`  run ${run}/${runs} ... `);
      const attempt = await runOnce(client, model, task, run, timeoutMs);
      attempts.push(attempt);

      const secs = `${(attempt.ms / 1000).toFixed(1)}s`;
      if (attempt.error) console.log(`ERROR    ${secs}  ${attempt.error}`);
      else if (attempt.ok) console.log(`ok       ${secs}  "${attempt.spoken.slice(0, 60)}"`);
      else console.log(`NO BLOCK ${secs}  (${attempt.text.length} chars returned)`);
    }

    results.set(label, attempts);
    console.log("");
  }

  // Raw output, redacted, so a failure can be read by hand rather than guessed at.
  mkdirSync(EVENTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawPath = join(EVENTS_DIR, `model-test-${stamp}.json`);
  writeFileSync(rawPath, JSON.stringify(redact(Object.fromEntries(results)), null, 2), "utf8");

  console.log("Paste this into docs/06-research.md:\n");
  console.log("| Model ID (as OpenCode reports it) | Block emitted correctly | Notes |");
  console.log("|---|---|---|");
  for (const [label, attempts] of results) {
    const passed = attempts.filter((a) => a.ok).length;
    console.log(`| ${label} | ${passed} / ${attempts.length} | ${notesFor(attempts)} |`);
  }

  console.log(`\nRaw responses: ${rawPath}`);
  console.log("Then update docs/07-open-questions.md question 3, and add a LOG.md entry.");
}

// Only run when invoked directly. Without this guard, importing `redact` from a test would
// execute the whole model test.
if (import.meta.main) await main();
