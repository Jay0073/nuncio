import { describe, expect, test } from "bun:test";
import { parseSpeakBlock, renderForSpeech, stripSpeakBlock, wordCount } from "./report-contract.ts";

describe("parseSpeakBlock", () => {
  test("reads a well formed block", () => {
    const text = `Here is my normal response on screen.

<<SPEAK>>
did: I removed groupCommitsByHour and two tests broke. I put it back, all 20 pass.
decision: I left formatDigest alone because splitting it is bigger than you asked for.
<<END>>`;

    expect(parseSpeakBlock(text)).toEqual({
      did: "I removed groupCommitsByHour and two tests broke. I put it back, all 20 pass.",
      decision: "I left formatDigest alone because splitting it is bigger than you asked for.",
    });
  });

  test("returns null when there is no block", () => {
    expect(parseSpeakBlock("Just a normal answer with no block.")).toBeNull();
  });

  test("returns null when the block has no recognised keys", () => {
    expect(parseSpeakBlock("<<SPEAK>>\nsomething random\n<<END>>")).toBeNull();
  });

  test("survives a missing close tag", () => {
    // Happens when a model runs out of output tokens.
    expect(parseSpeakBlock("<<SPEAK>>\ndid: Finished the migration.")).toEqual({
      did: "Finished the migration.",
    });
  });

  test("joins a wrapped line back together", () => {
    const text = `<<SPEAK>>
did: Rewrote the parser so it handles
nested groups correctly.
<<END>>`;
    expect(parseSpeakBlock(text)?.did).toBe("Rewrote the parser so it handles nested groups correctly.");
  });

  test("takes the last block when a model emits more than one", () => {
    const text = "<<SPEAK>>\ndid: First.\n<<END>>\nmore work\n<<SPEAK>>\ndid: Second.\n<<END>>";
    expect(parseSpeakBlock(text)?.did).toBe("Second.");
  });

  test("drops placeholder values instead of speaking them", () => {
    // Seen on a real run: a model wrote "ask: none", which would have been spoken aloud.
    for (const filler of ["none", "None.", "N/A", "n/a", "nothing", "null", "-", "—"]) {
      const text = `<<SPEAK>>\ndid: Shipped it.\nask: ${filler}\n<<END>>`;
      expect(parseSpeakBlock(text)).toEqual({ did: "Shipped it." });
    }
  });

  test("returns null when every line is a placeholder", () => {
    expect(parseSpeakBlock("<<SPEAK>>\ndid: none\nask: N/A\n<<END>>")).toBeNull();
  });

  test("does not mistake real content that starts with a filler word", () => {
    const text = "<<SPEAK>>\ndid: No database credentials were set, so I stopped.\n<<END>>";
    expect(parseSpeakBlock(text)?.did).toBe("No database credentials were set, so I stopped.");
  });

  test("accepts different casing and spacing", () => {
    expect(parseSpeakBlock("<<SPEAK>>\n  Did :  Ran the tests.\n<<END>>")).toEqual({
      did: "Ran the tests.",
    });
  });
});

describe("stripSpeakBlock", () => {
  test("removes the block from what stays on screen", () => {
    expect(stripSpeakBlock("Visible response.\n\n<<SPEAK>>\ndid: Finished.\n<<END>>")).toBe(
      "Visible response.",
    );
  });

  test("leaves text without a block untouched", () => {
    expect(stripSpeakBlock("No block here.")).toBe("No block here.");
  });
});

describe("renderForSpeech", () => {
  test("orders the parts and adds sentence endings", () => {
    expect(
      renderForSpeech({
        did: "Added auth across 4 files",
        decision: "I used cookies rather than localStorage",
        ask: "Keep the 15 minute expiry?",
      }),
    ).toBe(
      "Added auth across 4 files. One decision: I used cookies rather than localStorage. Keep the 15 minute expiry?",
    );
  });

  test("strips markdown the model emitted anyway", () => {
    // A spoken asterisk is worse than a missed one, so this is belt and braces with the
    // instruction that already forbids markdown.
    expect(renderForSpeech({ did: "Changed `index.ts` and **package.json**" })).toBe(
      "Changed index.ts and package.json.",
    );
  });

  test("handles a block with one field", () => {
    expect(renderForSpeech({ ask: "Postgres or SQLite?" })).toBe("Postgres or SQLite?");
  });
});

describe("wordCount", () => {
  test("counts words, ignoring extra whitespace", () => {
    expect(wordCount("  one   two \n three ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
