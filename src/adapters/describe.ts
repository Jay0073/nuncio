/**
 * Turn a permission request into something worth hearing.
 *
 * Reading the raw command aloud does not work. Measured across a real capture, permission
 * commands ran from 24 to 905 characters. The 905-character one was a PowerShell pipeline of
 * quoted Windows paths — roughly two minutes of spoken punctuation.
 *
 * Two rules come from real use:
 *
 * 1. **First person.** nuncio and the agent are one colleague, not a tool narrating another
 *    tool. "I want to run", never "It wants to run".
 * 2. **Detail scales with risk.** In real use most permissions are auto-approved and only the
 *    dangerous ones reach your ears — so those are exactly the ones that deserve more words.
 *
 * Track TURN-TAKING L3, pulled forward from v4. v2 is answering permissions by voice, and you
 * cannot answer what you cannot understand.
 */

export type RiskTier = "read-only" | "writes" | "network" | "destructive";

/** Read as: the last rule that matches wins, so the most dangerous pattern is checked last. */
const RISK_PATTERNS: [RiskTier, RegExp][] = [
  ["writes", /\b(new-item|mkdir|set-content|out-file|touch|copy-item|cp|mv|move-item|git\s+(add|commit|init))\b/i],
  ["network", /\b(curl|wget|invoke-webrequest|invoke-restmethod|npm\s+(i|install)|bun\s+(add|install)|pnpm\s+add|yarn\s+add|pip\s+install|git\s+(push|pull|clone|fetch))\b/i],
  // Patterns are deliberately narrow. A false "that is destructive" trains you to ignore the
  // warning, which is worse than not warning at all. `format` used to be a bare word here and
  // fired on `git log --pretty=format:%h`.
  [
    "destructive",
    /(\brm\s+-[a-z]*[rf]|\bremove-item\b|\brmdir\b|\bdel\s+\/|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|git\s+push\s+[^;]*--force|--force-with-lease|\bdrop\s+(table|database)\b|\btruncate\s+table\b|\bshutdown\b|\bformat\s+[a-z]:)/i,
  ],
];

/** What a command does, in plain words. First match per group wins. */
const ACTIONS: [RegExp, string][] = [
  [/\b(rm|remove-item|rmdir|del)\b/i, "deletes files"],
  [/\b(new-item|mkdir)\b/i, "creates folders"],
  [/\b(set-content|out-file|touch|copy-item)\b/i, "writes files"],
  [/\b(bun|npm|pnpm|yarn)\s+(test|run\s+test)\b/i, "runs the tests"],
  [/\b(bun|npm|pnpm|yarn)\s+(add|install|i)\b/i, "installs packages"],
  [/\bgit\s+init\b/i, "creates a git repository"],
  [/\bgit\s+(commit)\b/i, "commits"],
  [/\bgit\s+push\b/i, "pushes to the remote"],
  [/\bgit\s+(log|status|diff|show)\b/i, "reads git history"],
  [/\b(tsc|typecheck)\b/i, "runs the type checker"],
  [/\b(get-childitem|ls|dir|get-content|cat|type)\b/i, "reads files"],
  [/\b(curl|wget|invoke-webrequest|invoke-restmethod)\b/i, "makes a network request"],
];

export function riskOf(command: string): RiskTier {
  let tier: RiskTier = "read-only";
  for (const [candidate, pattern] of RISK_PATTERNS) {
    if (pattern.test(command)) tier = candidate;
  }
  return tier;
}

/** Split a shell one-liner into its steps. Good enough for counting and for naming actions. */
export function steps(command: string): string[] {
  return command
    .split(/;|&&|\|\||\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Up to three plain-English actions, in the order they appear. */
export function actionsOf(command: string): string[] {
  const found: string[] = [];
  for (const [pattern, label] of ACTIONS) {
    if (pattern.test(command) && !found.includes(label)) found.push(label);
    if (found.length === 3) break;
  }
  return found;
}

/** Paths worth naming when something destructive is about to happen. */
export function pathsIn(command: string): string[] {
  const found = new Set<string>();
  for (const match of command.matchAll(/"([^"]{3,})"|'([^']{3,})'/g)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (!/[\\/]/.test(value) || value.includes(" -")) continue;
    // Shell variables are not expanded at this point. Saying "dollar base slash alpha" aloud is
    // noise, and it does not tell you which real folder is about to be deleted.
    if (/[$%]/.test(value)) continue;
    found.add(lastTwoSegments(value));
  }
  return [...found].slice(0, 3);
}

function lastTwoSegments(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

const RISK_SENTENCE: Record<RiskTier, string> = {
  "read-only": "",
  writes: "",
  network: "That reaches the network.",
  destructive: "That is destructive.",
};

/** How many words the description may use, by how much it matters. */
const SHORT_COMMAND = 90;

/**
 * Describe a bash permission.
 *
 * Short and harmless commands are read out as they are — hearing the actual command is better
 * than hearing a paraphrase of it. Long or dangerous ones are described instead, and the
 * dangerous ones name the paths involved.
 */
export function describeBash(command: string): string {
  const trimmed = command.trim();
  const tier = riskOf(trimmed);
  const parts = steps(trimmed);

  if (trimmed.length <= SHORT_COMMAND && parts.length === 1 && tier !== "destructive") {
    return join([`I want to run: ${trimmed}.`, RISK_SENTENCE[tier]]);
  }

  const actions = actionsOf(trimmed);
  const what = actions.length ? ` that ${asList(actions)}` : "";
  const size = parts.length > 1 ? `a ${parts.length}-step command` : "a long command";

  const detail =
    tier === "destructive" ? namePaths(pathsIn(trimmed)) : "";

  return join([`I want to run ${size}${what}.`, RISK_SENTENCE[tier], detail]);
}

function namePaths(paths: string[]): string {
  if (paths.length === 0) return "Check the screen before allowing it.";
  if (paths.length === 1) return `It touches ${paths[0]}. Check the screen before allowing it.`;
  return `It touches ${asList(paths)}. Check the screen before allowing it.`;
}

/** Describe an edit permission. The diff gives us a real size, which is worth saying. */
export function describeEdit(fileName: string, diff: string | undefined): string {
  if (!diff) return `I want to edit ${fileName}.`;

  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }

  if (added === 0 && removed === 0) return `I want to edit ${fileName}.`;
  if (removed === 0) return `I want to edit ${fileName}, adding ${plural(added, "line")}.`;
  if (added === 0) return `I want to edit ${fileName}, removing ${plural(removed, "line")}.`;
  return `I want to edit ${fileName}, adding ${plural(added, "line")} and removing ${removed}.`;
}

/** The spoken options. Kept identical for permissions so the answer is always the same words. */
export function permissionOptions(): string {
  return "Allow once, allow for this session, or deny?";
}

export interface QuestionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

/**
 * Ask a question the way a colleague would.
 *
 * Not "here is a question, here are three options". Say what you would do and why, then name
 * the alternatives. The event already carries a description per option and marks the
 * recommended one, so this costs nothing extra.
 */
export function describeQuestion(question: string, options: QuestionOption[]): string {
  if (options.length === 0) return question;

  const recommended = options.find((o) => o.recommended);
  const others = options.filter((o) => o !== recommended).map((o) => o.label);

  if (!recommended) {
    return join([question, `The options are ${asList(options.map((o) => o.label))}. Which one?`]);
  }

  const because = recommended.description ? ` — ${firstSentence(recommended.description)}` : "";
  const rest = others.length ? ` The others are ${asList(others)}.` : "";
  return join([question, `I would go with ${recommended.label}${because}.${rest} Which one?`]);
}

/**
 * The first sentence of an option description.
 *
 * A full stop only ends a sentence when whitespace or the end of the string follows it.
 * Without that check, ".git folders" and "index.ts" get cut in half — which is exactly what
 * happened the first time this ran against a real option description.
 */
function firstSentence(text: string): string {
  // Option descriptions are written for the screen, so they carry backticks and markdown.
  // Spoken, a backtick is a small noise with no meaning.
  const trimmed = text
    .replace(/`+/g, "")
    .replace(/\*\*?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  return (match ? match[0] : trimmed).replace(/[.!?]+$/, "").trim();
}

function asList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function join(parts: string[]): string {
  return parts.filter((p) => p && p.trim()).join(" ").replace(/\s+/g, " ").trim();
}
