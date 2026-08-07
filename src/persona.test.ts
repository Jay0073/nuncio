import { describe, expect, test } from "bun:test";
import { parseSpeakBlock, renderForSpeech, stripSpeakBlock } from "./persona.ts";

describe("parseSpeakBlock", () => {
  test("reads a well formed block", () => {
    const text = `Here is my normal response on screen.

<<SPEAK>>
done: Added JWT auth with refresh tokens. 4 files.
decision: Used httpOnly cookies instead of localStorage.
<<END>>`;

    expect(parseSpeakBlock(text)).toEqual({
      done: "Added JWT auth with refresh tokens. 4 files.",
      decision: "Used httpOnly cookies instead of localStorage.",
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
    expect(parseSpeakBlock("<<SPEAK>>\ndone: Finished the migration.")).toEqual({
      done: "Finished the migration.",
    });
  });

  test("joins a wrapped line back together", () => {
    const text = `<<SPEAK>>
done: Rewrote the parser so it handles
nested groups correctly.
<<END>>`;
    expect(parseSpeakBlock(text)?.done).toBe(
      "Rewrote the parser so it handles nested groups correctly.",
    );
  });

  test("takes the last block when a model emits more than one", () => {
    const text = `<<SPEAK>>
done: First attempt.
<<END>>
then more work happened
<<SPEAK>>
done: Second attempt.
<<END>>`;
    expect(parseSpeakBlock(text)?.done).toBe("Second attempt.");
  });

  test("ignores keys the model left empty", () => {
    const text = "<<SPEAK>>\ndone: Shipped it.\nblocked:\nask:\n<<END>>";
    expect(parseSpeakBlock(text)).toEqual({ done: "Shipped it." });
  });

  test("accepts different casing and spacing", () => {
    const text = "<<SPEAK>>\n  Done :  Ran the tests.\n<<END>>";
    expect(parseSpeakBlock(text)).toEqual({ done: "Ran the tests." });
  });
});

describe("stripSpeakBlock", () => {
  test("removes the block from what stays on screen", () => {
    const text = "Visible response.\n\n<<SPEAK>>\ndone: Finished.\n<<END>>";
    expect(stripSpeakBlock(text)).toBe("Visible response.");
  });

  test("leaves text without a block untouched", () => {
    expect(stripSpeakBlock("No block here.")).toBe("No block here.");
  });
});

describe("renderForSpeech", () => {
  test("orders the parts and adds sentence endings", () => {
    const spoken = renderForSpeech({
      done: "Added auth. 4 files",
      decision: "Used cookies",
      ask: "Keep the 15 minute expiry?",
    });
    expect(spoken).toBe(
      "Added auth. 4 files. I decided: Used cookies. Keep the 15 minute expiry?",
    );
  });

  test("handles a block with one field", () => {
    expect(renderForSpeech({ blocked: "Cannot reach the database" })).toBe(
      "I am blocked: Cannot reach the database.",
    );
  });
});
