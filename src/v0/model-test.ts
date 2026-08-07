/**
 * v0 — measure whether a model can follow the <<SPEAK>> block contract.
 *
 * This is the second job of v0. The whole speak-layer in v1 depends on the agent emitting the
 * block at the end of every turn. Free-tier models follow formatting instructions less
 * reliably than frontier models, so we measure it instead of assuming it.
 *
 * See docs/03-versions.md (v0) and docs/07-open-questions.md, question 3.
 *
 * Usage:
 *   opencode serve
 *   bun run model-test                                  # tests OpenCode's default model
 *   bun run model-test -- --runs 5
 *   bun run model-test -- --model anthropic/some-model  # repeatable
 *   bun run model-test -- --task "Count the files here"
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { BASE_URL, EVENTS_DIR } from "../config.ts";
import { PERSONA, parseSpeakBlock, renderForSpeech, type SpeakBlock } from "../persona.ts";

type Client = ReturnType<typeof createOpencodeClient>;

/** Read-only, small, and it exercises a tool call followed by a report. */
const DEFAULT_TASK = "Count how many files are in the current directory and tell me the number.";

interface Attempt {
  run: number;
  ok: boolean;
  block: SpeakBlock | null;
  spoken: string;
  text: string;
  error?: string;
}

interface Options {
  runs: number;
  models: (string | undefined)[];
  task: string;
}

function parseArgs(argv: string[]): Options {
  let runs = 10;
  let task = DEFAULT_TASK;
  const models: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1]) runs = Number(argv[++i]) || runs;
    if (argv[i] === "--task" && argv[i + 1]) task = argv[++i]!;
    if (argv[i] === "--model" && argv[i + 1]) models.push(argv[++i]!);
  }

  // `undefined` means: send no model field, so OpenCode uses its configured default.
  return { runs, task, models: models.length > 0 ? models : [undefined] };
}

/**
 * Pull the assistant's text out of whatever shape the SDK returns.
 *
 * The exact response shape is one of the things v0 is meant to discover, so this walks the
 * object rather than assuming a path. If it finds nothing, the caller dumps the raw response
 * so we can look at it by hand.
 */
function extractText(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return "";

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((v) => extractText(v, depth + 1)).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // A text part: { type: "text", text: "..." }
    if (obj.type === "text" && typeof obj.text === "string") return obj.text;

    // Skip reasoning parts. They are internal thinking and often contain a practice block
    // that would make a failing model look like it passed.
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

/** Print whatever the server will tell us about configured providers and models. */
async function discover(client: Client): Promise<void> {
  const candidates: [string, () => Promise<unknown>][] = [
    ["config.providers", () => (client as any).config.providers()],
    ["config.get", () => (client as any).config.get()],
    ["app.providers", () => (client as any).app.providers()],
  ];

  for (const [name, call] of candidates) {
    try {
      const result = await call();
      const text = JSON.stringify(result, null, 2);
      console.log(`\n--- ${name} ---`);
      console.log(text.length > 4000 ? text.slice(0, 4000) + "\n… truncated" : text);
      return;
    } catch {
      // Method does not exist on this SDK version, or the call failed. Try the next one.
    }
  }
  console.log("Could not list models from the server. Use --model to name one explicitly.");
}

async function runOnce(
  client: Client,
  model: string | undefined,
  task: string,
  run: number,
): Promise<Attempt> {
  try {
    const created = await client.session.create({
      body: { title: `nuncio v0 model test run ${run}` },
    });

    const sessionId = findSessionId(created);
    if (!sessionId) {
      return { run, ok: false, block: null, spoken: "", text: "", error: "no session id in create response" };
    }

    const response = await client.session.prompt({
      path: { id: sessionId },
      body: {
        ...toModelBody(model),
        parts: [{ type: "text", text: `${PERSONA}\n\n---\n\n${task}` }],
      },
    } as never);

    const text = extractText(response);
    const block = parseSpeakBlock(text);

    return {
      run,
      ok: block !== null,
      block,
      spoken: block ? renderForSpeech(block) : "",
      text,
    };
  } catch (error) {
    return {
      run,
      ok: false,
      block: null,
      spoken: "",
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

async function main(): Promise<void> {
  const { runs, models, task } = parseArgs(process.argv.slice(2));
  const client = createOpencodeClient({ baseUrl: BASE_URL });

  console.log(`nuncio v0 — model reliability test`);
  console.log(`Server: ${BASE_URL}`);
  console.log(`Task:   ${task}`);
  console.log(`Runs:   ${runs} per model\n`);

  await discover(client);

  const results = new Map<string, Attempt[]>();

  for (const model of models) {
    const label = model ?? "(OpenCode default)";
    console.log(`\n=== ${label} ===`);
    const attempts: Attempt[] = [];

    for (let run = 1; run <= runs; run++) {
      process.stdout.write(`  run ${run}/${runs} ... `);
      const attempt = await runOnce(client, model, task, run);
      attempts.push(attempt);

      if (attempt.error) console.log(`ERROR  ${attempt.error}`);
      else if (attempt.ok) console.log(`ok     "${attempt.spoken.slice(0, 70)}"`);
      else console.log(`NO BLOCK  (${attempt.text.length} chars returned)`);
    }

    results.set(label, attempts);
  }

  // Raw output, so a failure can be inspected by hand rather than guessed at.
  mkdirSync(EVENTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawPath = join(EVENTS_DIR, `model-test-${stamp}.json`);
  writeFileSync(rawPath, JSON.stringify(Object.fromEntries(results), null, 2), "utf8");

  // A table ready to paste into docs/06-research.md.
  console.log(`\n\nPaste this into docs/06-research.md:\n`);
  console.log("| Model ID (as OpenCode reports it) | Block emitted correctly | Notes |");
  console.log("|---|---|---|");
  for (const [label, attempts] of results) {
    const passed = attempts.filter((a) => a.ok).length;
    const errors = attempts.filter((a) => a.error).length;
    const notes = errors > 0 ? `${errors} call(s) failed outright` : notesFor(attempts);
    console.log(`| ${label} | ${passed} / ${attempts.length} | ${notes} |`);
  }

  console.log(`\nRaw responses: ${rawPath}`);
  console.log("Then update docs/07-open-questions.md question 3, and add a LOG.md entry.");
}

function notesFor(attempts: Attempt[]): string {
  const withBlock = attempts.filter((a) => a.block);
  if (withBlock.length === 0) return "never emitted the block";
  const keys = new Set<string>();
  for (const a of withBlock) for (const k of Object.keys(a.block!)) keys.add(k);
  return `keys seen: ${[...keys].join(", ")}`;
}

await main();
