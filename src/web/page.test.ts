/**
 * Smoke tests for the page.
 *
 * The page is hand-edited HTML with inline script and had no coverage at all. These catch the
 * mistakes that actually happen when editing it: a control renamed in the markup but not in the
 * script, a syntax error, or the page reading a field the daemon no longer sends.
 *
 * Not a substitute for opening it in a browser. It is a substitute for finding out from the
 * owner that a button does nothing.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "src", "web", "index.html"), "utf8");
const stateSource = readFileSync(join(process.cwd(), "src", "core", "state.ts"), "utf8");
const reportSource = readFileSync(join(process.cwd(), "src", "core", "report.ts"), "utf8");

const declaredIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

describe("the page", () => {
  test("every element the script reaches for exists in the markup", () => {
    const used = [...html.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    for (const id of used) {
      expect(declaredIds.has(id), `getElementById("${id}") has no matching id in the markup`).toBe(
        true,
      );
    }
  });

  test("the script parses", () => {
    expect(script.length).toBeGreaterThan(1000);
    // Throws on a syntax error. It is never called, so DOM globals do not matter.
    expect(() => new Function(script)).not.toThrow();
  });

  test("every state field the page reads is on NuncioState", () => {
    const fields = [...html.matchAll(/\bstate\.(\w+)/g)].map((m) => m[1]!);
    const known = new Set(["state"]); // `state.state` is the machine's own state name
    for (const field of fields) {
      if (known.has(field)) continue;
      expect(
        new RegExp(`\\b${field}\\??:`).test(stateSource),
        `page reads state.${field}, which is not on NuncioState`,
      ).toBe(true);
    }
  });

  test("every report field the page reads is on Report", () => {
    const fields = [...html.matchAll(/\breport\.(\w+)/g)].map((m) => m[1]!);
    expect(fields.length).toBeGreaterThan(3);
    for (const field of fields) {
      expect(
        new RegExp(`\\b${field}\\??:`).test(reportSource),
        `page reads report.${field}, which is not on Report`,
      ).toBe(true);
    }
  });

  test("the speak/do-not-speak control says plainly what it does", () => {
    // An earlier version had an "Enable sound" button — a browser requirement — sitting next to
    // the real toggle. They were impossible to tell apart, and the owner pressed the wrong one
    // twice, then reported that nuncio was broken. It was not.
    expect(html).toContain("Speaking: ON");
    expect(html).toContain("Speaking: OFF");
    expect(html).not.toContain('id="enable"');
  });

  test("no visible text tells the user to press a button that does not exist", () => {
    // The first fix removed the button but left the instruction pointing at it.
    const visible = html.replace(/<script>[\s\S]*?<\/script>/g, "");
    expect(visible).not.toContain("Enable sound");
  });

  test("audio unlocks on any click, so there is no separate button to find", () => {
    expect(script).toContain('document.addEventListener("click", enableSound');
  });
});
