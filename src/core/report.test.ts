import { describe, expect, test } from "bun:test";
import { buildReport, fileName } from "./report.ts";

const block = (body: string) => `On-screen response.\n\n<<SPEAK>>\n${body}\n<<END>>`;

describe("buildReport — the normal path", () => {
  test("uses the block the agent wrote", () => {
    const report = buildReport(block("did: Removed the helper, 20 tests pass."), []);
    expect(report.source).toBe("block");
    expect(report.text).toBe("Removed the helper, 20 tests pass.");
    expect(report.needsYou).toBe(false);
  });

  test("an ask means the agent is waiting on you", () => {
    const report = buildReport(block("did: Set up auth.\nask: Postgres or SQLite?"), []);
    expect(report.needsYou).toBe(true);
  });

  test("holds back the tail when a report runs past the budget", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} here.`).join(" ");
    const report = buildReport(block(`did: ${long}`), []);
    expect(report.rest).not.toBe("");
    expect(report.fullWords).toBeGreaterThan(45);
  });

  test("a short report is never cut and offers nothing more", () => {
    const report = buildReport(block("did: Short and fine."), []);
    expect(report.rest).toBe("");
    expect(report.fullWords).toBeUndefined();
  });

  test("the budget grows with the number of files changed", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} here.`).join(" ");
    const small = buildReport(block(`did: ${long}`), []);
    const big = buildReport(block(`did: ${long}`), ["/a/1.ts", "/a/2.ts", "/a/3.ts", "/a/4.ts"]);
    expect(big.text.length).toBeGreaterThan(small.text.length);
  });
});

describe("buildReport — the fallback", () => {
  // D-013. The fallback must never be the raw response. A thin honest report that sends you to
  // the screen beats two minutes of markdown read aloud.
  test("never speaks the raw response when the block is missing", () => {
    const raw = "Here is a very long technical answer with **markdown** and `code`.";
    const report = buildReport(raw, []);
    expect(report.source).toBe("fallback");
    expect(report.text).not.toContain("markdown");
    expect(report.text).not.toContain("very long technical");
  });

  test("says so plainly when nothing changed", () => {
    const report = buildReport(null, []);
    expect(report.text).toBe(
      "Finished, but no summary was given and no files changed. Check the screen.",
    );
  });

  test("names the file when exactly one changed", () => {
    const report = buildReport(null, ["C:\\p\\package.json"]);
    expect(report.text).toBe("Finished. Changed package.json. No summary was given, so check the screen.");
  });

  test("names the first three and counts the rest", () => {
    const report = buildReport(null, ["/a/one.ts", "/a/two.ts", "/a/three.ts", "/a/four.ts", "/a/five.ts"]);
    expect(report.text).toContain("Changed 5 files: one.ts, two.ts, three.ts, and 2 more");
  });

  test("collapses a file edited several times in one turn", () => {
    const report = buildReport(null, ["/a/one.ts", "/a/one.ts", "/a/two.ts"]);
    expect(report.text).toContain("Changed 2 files");
  });

  test("a fallback never claims you are needed", () => {
    // We cannot know from file events alone, and a false "needs you" tone erodes trust in it.
    expect(buildReport(null, ["/a/one.ts"]).needsYou).toBe(false);
  });
});

describe("fileName", () => {
  test("handles both separators", () => {
    expect(fileName("C:\\Users\\jay\\projects\\standup\\package.json")).toBe("package.json");
    expect(fileName("/home/jay/standup/index.ts")).toBe("index.ts");
    expect(fileName("bare.txt")).toBe("bare.txt");
  });
});
