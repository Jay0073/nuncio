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

/**
 * What one step of a command actually does, with its subject.
 *
 * "a six-step command" tells you nothing. You need to hear *what* it does — "commit with the
 * message fix date parsing" — or you cannot decide whether to allow it. Each pattern captures
 * the part that carries the meaning and puts it in the sentence.
 *
 * First match wins, so specific patterns go above general ones.
 */
const STEP_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/git\s+commit\b[^"']*["']([^"']{1,80})["']/i, (m) => `commit with the message, ${m[1]}`],
  [/git\s+commit\b/i, () => "make a commit"],
  [/git\s+push\s+(\S+)\s+(\S+)/i, (m) => `push ${m[2]} to ${m[1]}`],
  [/git\s+push\b/i, () => "push to the remote"],
  [/git\s+(?:checkout|switch)\s+-b\s+(\S+)/i, (m) => `create a branch called ${m[1]}`],
  [/git\s+(?:checkout|switch)\s+(\S+)/i, (m) => `switch to ${m[1]}`],
  [/git\s+init\b/i, () => "set up a git repository here"],
  [/git\s+add\b/i, () => "stage the changes"],
  [/git\s+reset\s+--hard\b/i, () => "throw away all uncommitted changes"],
  [/git\s+(?:log|status|diff|show)\b/i, () => "read the git history"],

  [/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?test\b\s*(\S+)?/i, (m) =>
    m[1] && !m[1].startsWith("-") ? `run the tests in ${named(m[1], "")}` : "run the tests"],
  [/\b(?:bun|npm|pnpm|yarn)\s+(?:add|install|i)\s+(?!-)(\S+)/i, (m) =>
    `install ${named(m[1], "a package")}`],
  [/\b(?:bun|npm|pnpm|yarn)\s+(?:add|install|i)\b/i, () => "install the dependencies"],
  [/\b(?:bun|npm|pnpm|yarn)\s+run\s+(\S+)/i, (m) => runScriptPhrase(m[1])],
  [/\b(?:tsc|typecheck)\b/i, () => "run the type checker"],

  [/(?:rm|remove-item|rmdir|del)\b[^"']*["']([^"']{1,90})["']/i, (m) =>
    `delete ${named(m[1], "a folder")}`],
  [/(?:rm|remove-item|rmdir)\s+(?:-\S+\s+)*(\S+)/i, (m) => `delete ${named(m[1], "a folder")}`],
  // `-Path` first. Without it the generic pattern below picks up the value of an earlier flag:
  // `New-Item -ItemType Directory -Path $fresh` came out as "create the folder Directory".
  [/(?:new-item|mkdir)\b[^;]*?-path\s+["']?([^"',;\s]+)/i, (m) =>
    createPhrase(m[1])],
  [/(?:new-item|mkdir)\b[^"']*["']([^"']{1,90})["']/i, (m) =>
    createPhrase(m[1])],
  [/(?:new-item|mkdir)\s+(?:-\S+\s+)*(\S+)/i, (m) => createPhrase(m[1])],
  [/(?:set-content|out-file|copy-item|touch)\b[^"']*["']([^"']{1,90})["']/i, (m) =>
    `write ${named(m[1], "a file")}`],
  [/\b(?:set-content|out-file|copy-item|touch)\b/i, () => "write a file"],

  [/(?:test-path)\b/i, () => "check whether a path exists"],
  [/\b(?:get-content|cat|type)\s+(\S+)/i, (m) => `read ${named(m[1], "a file")}`],
  [/\b(?:get-childitem|ls|dir)\b/i, () => "list the files here"],
  [/\b(?:curl|wget|invoke-webrequest|invoke-restmethod)\s+(\S+)/i, (m) =>
    `fetch ${host(m[1]!)} over the network`],
  [/\b(?:curl|wget|invoke-webrequest|invoke-restmethod)\b/i, () => "make a network request"],
];

/** The name if it is worth saying, otherwise a generic word. */
function named(value: string | undefined, fallback: string): string {
  return subject(value) ?? fallback;
}

/**
 * Phrases where the fallback needs different wording, not just a different noun.
 *
 * Substituting "a folder" into "create the folder ..." produced "create the folder a folder".
 */
function createPhrase(value: string | undefined): string {
  const name = subject(value);
  return name ? `create the folder ${name}` : "create a folder";
}

function runScriptPhrase(value: string | undefined): string {
  const name = subject(value);
  return name ? `run the ${name} script` : "run a script";
}

/**
 * A speakable name for a path or argument, or null when naming it would be meaningless.
 *
 * Two things it handles:
 *
 * - **Shell variables are not expanded yet.** "delete base" — from `$base` — tells the listener
 *   nothing at all, so a value that is only a variable is dropped and the caller falls back to
 *   a generic word.
 * - **Full paths are unbearable spoken.** Only the last segment is kept.
 */
function subject(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^["']|["']$/g, "").trim();
  const parts = cleaned
    .split(/[\\/]/)
    .filter(Boolean)
    .filter((part) => !/^[$%]/.test(part));
  const last = parts.at(-1);
  return last && last.length > 0 ? last : null;
}

function host(url: string): string {
  const match = /^https?:\/\/([^/\s"']+)/i.exec(url);
  return match ? match[1]! : (subject(url) ?? "a remote address");
}

/** Describe one step, or null when nothing recognisable is in it. */
export function describeStep(step: string): string | null {
  for (const [pattern, render] of STEP_PATTERNS) {
    const match = pattern.exec(step);
    if (match) return render(match);
  }
  return null;
}

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

/** What each step of the command does, in order, without repeats. Up to three. */
export function actionsOf(command: string): string[] {
  const found: string[] = [];
  for (const step of steps(command)) {
    const phrase = describeStep(step);
    if (phrase && !found.includes(phrase)) found.push(phrase);
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

  // Say what it does. "A six-step command" tells you nothing you can decide on.
  let opening: string;
  if (actions.length === 0) {
    opening =
      parts.length > 1
        ? `I want to run ${parts.length} commands. I cannot summarise them, so please look at the screen.`
        : `I want to run a long command. Please look at the screen.`;
  } else if (actions.length === 1) {
    opening = `I want to ${actions[0]}.`;
  } else {
    const extra = parts.length > actions.length ? `, and ${parts.length - actions.length} more` : "";
    // A sequence, not a choice. "delete build or create alpha" would be a different request.
    opening = `I want to ${asSequence(actions)}${extra}.`;
  }

  const detail = tier === "destructive" ? namePaths(pathsIn(trimmed)) : "";

  return join([opening, RISK_SENTENCE[tier], detail]);
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

/** Alternatives: "a, b or c". Use for options the listener chooses between. */
function asList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/** Steps in order: "a, then b, then c". Use for things that happen one after another. */
function asSequence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return items.join(", then ");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function join(parts: string[]): string {
  return parts.filter((p) => p && p.trim()).join(" ").replace(/\s+/g, " ").trim();
}
