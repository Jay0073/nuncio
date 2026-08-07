/**
 * Install the spoken report contract into a project.
 *
 * In v1 you type in the TUI, so nuncio never sees your prompt and cannot inject anything into
 * it. The contract has to reach the agent another way. OpenCode's config supports an
 * `instructions` array of files whose contents are given to the agent, so nuncio writes its
 * contract to a file and adds that file to the list.
 *
 * This is per-project and reversible: `--remove` takes it back out and deletes the file.
 *
 * Usage:
 *   bun run install-contract -- C:\path\to\your\project
 *   bun run install-contract -- C:\path\to\your\project --remove
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_CONTRACT } from "../report-contract.ts";

const CONTRACT_DIR = ".nuncio";
const CONTRACT_FILE = join(CONTRACT_DIR, "spoken-report.md");

interface OpenCodeConfig {
  $schema?: string;
  instructions?: string[];
  [key: string]: unknown;
}

function main(): void {
  const args = process.argv.slice(2);
  const remove = args.includes("--remove");
  const projectDir = args.find((a) => !a.startsWith("--")) ?? process.cwd();

  if (!existsSync(projectDir)) {
    console.error(`No such directory: ${projectDir}`);
    process.exit(1);
  }

  if (!existsSync(join(projectDir, ".git"))) {
    // D-019. Without this the config file is read by nobody.
    console.error(`${projectDir} is not a git repository.`);
    console.error("OpenCode resolves a project by its git worktree. Run 'git init' there first,");
    console.error("or the project config — including this contract — will be silently ignored.");
    process.exit(1);
  }

  const configPath = join(projectDir, "opencode.json");
  const config: OpenCodeConfig = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, "utf8")) as OpenCodeConfig)
    : { $schema: "https://opencode.ai/config.json" };

  const listed = config.instructions ?? [];
  const contractPath = join(projectDir, CONTRACT_FILE);

  if (remove) {
    config.instructions = listed.filter((entry) => normalise(entry) !== normalise(CONTRACT_FILE));
    if (config.instructions.length === 0) delete config.instructions;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    rmSync(contractPath, { force: true });
    console.log(`Removed the contract from ${configPath}`);
    console.log("Restart 'opencode serve' for it to take effect.");
    return;
  }

  mkdirSync(join(projectDir, CONTRACT_DIR), { recursive: true });
  writeFileSync(contractPath, REPORT_CONTRACT + "\n", "utf8");

  if (!listed.some((entry) => normalise(entry) === normalise(CONTRACT_FILE))) {
    // Forward slashes: the config is read cross-platform and Windows accepts them.
    config.instructions = [...listed, CONTRACT_FILE.replace(/\\/g, "/")];
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  console.log(`Wrote    ${contractPath}`);
  console.log(`Updated  ${configPath}`);
  console.log("\nRestart 'opencode serve' so it picks up the config, then start a NEW session.");
  console.log("An existing session already has its instructions and will not change.");
}

function normalise(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

if (import.meta.main) main();
