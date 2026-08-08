import { describe, expect, test } from "bun:test";
import {
  actionsOf,
  describeBash,
  describeEdit,
  describeQuestion,
  riskOf,
  steps,
} from "./describe.ts";

describe("riskOf", () => {
  test("recognises destructive commands", () => {
    expect(riskOf("Remove-Item -Recurse -Force C:\\tmp\\x")).toBe("destructive");
    expect(riskOf("rm -rf build")).toBe("destructive");
    expect(riskOf("git reset --hard HEAD~1")).toBe("destructive");
  });

  test("recognises network commands", () => {
    expect(riskOf("bun add zod")).toBe("network");
    expect(riskOf("git push origin main")).toBe("network");
  });

  test("recognises writes", () => {
    expect(riskOf("New-Item -ItemType Directory src")).toBe("writes");
    expect(riskOf("git commit -m 'x'")).toBe("writes");
  });

  test("treats reads as read-only", () => {
    expect(riskOf("Get-ChildItem -Force")).toBe("read-only");
    expect(riskOf("git log --oneline")).toBe("read-only");
    expect(riskOf("bun test")).toBe("read-only");
  });

  test("the most dangerous pattern wins when several match", () => {
    // A command that installs and then deletes is destructive, not merely network.
    expect(riskOf("bun add zod; Remove-Item -Recurse -Force node_modules")).toBe("destructive");
  });
});

describe("describeBash", () => {
  test("a short harmless command is read out as it is", () => {
    // Hearing the real command beats hearing a paraphrase of it. The options sentence is
    // appended by the adapter, not here.
    expect(describeBash("bun test")).toBe("I want to run: bun test.");
  });

  test("speaks in the first person, never about a third party", () => {
    // nuncio and the agent are one colleague, not a tool narrating another tool.
    for (const command of ["bun test", "rm -rf build; mkdir build", "git push origin main"]) {
      expect(describeBash(command)).toStartWith("I want to");
      expect(describeBash(command)).not.toContain("It wants to");
    }
  });

  test("describes a long multi-step command instead of reading it", () => {
    // The real 905-character case from the capture. Reading it aloud is two minutes of noise.
    const command =
      '$base = "C:\\Users\\jay\\AppData\\Local\\Temp\\opencode\\standup-e2e"; ' +
      'if (Test-Path $base) { Remove-Item -Recurse -Force $base }; ' +
      'New-Item -ItemType Directory -Path "$base\\alpha","$base\\beta" -Force';

    const spoken = describeBash(command);
    expect(spoken).toContain("3-step command");
    expect(spoken).toContain("deletes files");
    expect(spoken).toContain("That is destructive.");
    expect(spoken.length).toBeLessThan(240);
    expect(spoken).not.toContain("AppData");
  });

  test("a destructive command names the paths it touches", () => {
    // Detail scales with risk: in real use only the dangerous ones reach your ears.
    const spoken = describeBash('Remove-Item -Recurse -Force "C:\\projects\\standup\\build"; New-Item -ItemType Directory "C:\\projects\\standup\\build"');
    expect(spoken).toContain("standup/build");
    expect(spoken).toContain("Check the screen before allowing it.");
  });

  test("a network command says so", () => {
    expect(describeBash("bun add zod && bun add -d vitest")).toContain("That reaches the network.");
  });

  test("a harmless long command is described but not alarmed about", () => {
    const spoken = describeBash("git log --oneline --since=2026-01-01 --author=jay --pretty=format:%h%s --no-merges --all");
    expect(spoken).toContain("I want to run");
    expect(spoken).not.toContain("destructive");
  });
});

describe("steps and actionsOf", () => {
  test("counts the steps of a shell one-liner", () => {
    expect(steps("a; b && c")).toEqual(["a", "b", "c"]);
    expect(steps("just one")).toEqual(["just one"]);
  });

  test("names at most three actions", () => {
    const actions = actionsOf("rm -rf x; mkdir y; bun test; git commit -m z; git push");
    expect(actions.length).toBeLessThanOrEqual(3);
    expect(actions[0]).toBe("deletes files");
  });
});

describe("describeEdit", () => {
  test("without a diff it just names the file", () => {
    expect(describeEdit("package.json", undefined)).toBe("I want to edit package.json.");
  });

  test("with a diff it gives the size, which is what you actually want to know", () => {
    const diff = ["--- a", "+++ b", "+one", "+two", "+three", "-old"].join("\n");
    expect(describeEdit("package.json", diff)).toBe(
      "I want to edit package.json, adding 3 lines and removing 1.",
    );
  });

  test("additions only", () => {
    expect(describeEdit("index.ts", "+++ b\n+one")).toBe("I want to edit index.ts, adding 1 line.");
  });

  test("the +++ and --- header lines are not counted as changes", () => {
    expect(describeEdit("index.ts", "--- a\n+++ b")).toBe("I want to edit index.ts.");
  });
});

describe("describeQuestion", () => {
  const options = [
    {
      label: "Scan current directory",
      description: "Recursively find .git folders under the working directory. Works for a folder of projects.",
      recommended: true,
    },
    { label: "Explicit paths as arguments", description: "User passes repo paths on the command line." },
    { label: "Config file", description: "A JSON config lists the repo paths." },
  ];

  test("asks the way a colleague would, not as a bare list", () => {
    const spoken = describeQuestion("How should the CLI find the repositories?", options);
    expect(spoken).toBe(
      "How should the CLI find the repositories? I would go with Scan current directory — " +
        "Recursively find .git folders under the working directory. " +
        "The others are Explicit paths as arguments or Config file. Which one?",
    );
  });

  test("falls back to a plain list when nothing is recommended", () => {
    const spoken = describeQuestion("Postgres or SQLite?", [{ label: "Postgres" }, { label: "SQLite" }]);
    expect(spoken).toBe("Postgres or SQLite? The options are Postgres or SQLite. Which one?");
  });

  test("a recommendation with no description still reads well", () => {
    const spoken = describeQuestion("Proceed?", [
      { label: "Approve", recommended: true },
      { label: "Request changes" },
    ]);
    expect(spoken).toBe("Proceed? I would go with Approve. The others are Request changes. Which one?");
  });

  test("a question with no options is left alone", () => {
    expect(describeQuestion("What now?", [])).toBe("What now?");
  });

  test("strips backticks and markdown from the description", () => {
    // Option descriptions are written for the screen. Spoken, a backtick is meaningless noise.
    const spoken = describeQuestion("How?", [
      { label: "Flags", description: "Use `--since <date>` and **`--until <date>`**. Both optional.", recommended: true },
      { label: "ISO only" },
    ]);
    expect(spoken).not.toContain("`");
    expect(spoken).not.toContain("*");
    expect(spoken).toContain("Use --since <date> and --until <date>");
  });
});

describe("pathsIn", () => {
  test("names the real folders a destructive command touches", () => {
    const spoken = describeBash('Remove-Item -Recurse -Force "C:\\projects\\standup\\build"');
    expect(spoken).toContain("standup/build");
  });

  test("skips unexpanded shell variables", () => {
    // "$base/alpha" spoken aloud is noise, and it does not say which real folder is at risk.
    const spoken = describeBash(
      'Remove-Item -Recurse -Force "$base"; New-Item -ItemType Directory -Path "$base\\alpha"',
    );
    expect(spoken).not.toContain("$");
    expect(spoken).toContain("Check the screen before allowing it.");
  });
});
