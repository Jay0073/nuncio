import { describe, expect, test } from "bun:test";
import { chunkText, chunkWords, dropRepeats, splitLong, toChunks, type Chunk } from "./speech.ts";
import type { Segment } from "../report-contract.ts";

const seg = (field: Segment["field"], text: string): Segment => ({ field, text });

describe("toChunks — pauses follow meaning, not punctuation", () => {
  test("one sentence per chunk", () => {
    const chunks = toChunks([seg("did", "First thing. Second thing. Third thing.")]);
    expect(chunks.map((c) => c.text)).toEqual(["First thing.", "Second thing.", "Third thing."]);
  });

  test("a field boundary gets a long pause, because it is a topic change", () => {
    const chunks = toChunks([seg("did", "I fixed it."), seg("decision", "One decision: I used cookies.")]);
    expect(chunks[0]!.pauseAfterMs).toBe(800);
  });

  test("sentences inside one field barely pause", () => {
    const chunks = toChunks([seg("did", "Short one. Another short one.")]);
    // Well under the field pause. This is a breath, not a break.
    expect(chunks[0]!.pauseAfterMs).toBeLessThan(300);
    expect(chunks[0]!.pauseAfterMs).toBeGreaterThan(0);
  });

  test("a dense sentence earns a longer beat than a short one", () => {
    // The whole point: give the listener time proportional to what they just took in.
    const short = toChunks([seg("did", "It works. Next.")]);
    const long = toChunks([
      seg(
        "did",
        "Three places in the date formatter assumed UTC while git log returns local time. Next.",
      ),
    ]);
    expect(long[0]!.pauseAfterMs).toBeGreaterThan(short[0]!.pauseAfterMs);
  });

  test("the pause is capped so it never feels like a fault", () => {
    const words = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ");
    const chunks = toChunks([seg("did", `${words}. Next.`)]);
    expect(chunks[0]!.pauseAfterMs).toBeLessThanOrEqual(450);
  });

  test("the last chunk has no pause — the silence is the report ending", () => {
    const chunks = toChunks([seg("did", "One. Two."), seg("ask", "Which one?")]);
    expect(chunks.at(-1)!.pauseAfterMs).toBe(0);
  });

  test("keeps which field each chunk came from", () => {
    const chunks = toChunks([seg("did", "Done."), seg("ask", "Postgres or SQLite?")]);
    expect(chunks.map((c) => c.field)).toEqual(["did", "ask"]);
  });

  test("does not split a file name in half", () => {
    // A full stop only ends a sentence when whitespace follows it.
    const chunks = toChunks([seg("did", "I changed index.ts and package.json. Tests pass.")]);
    expect(chunks[0]!.text).toBe("I changed index.ts and package.json.");
  });
});

describe("splitLong — one runaway sentence must not swallow the report", () => {
  test("a short sentence is left alone", () => {
    expect(splitLong("Three tests failed.")).toEqual(["Three tests failed."]);
  });

  test("breaks a long comma list at its joints", () => {
    // The real case: asked to review a function, the agent wrote all eight findings as one
    // 62-word comma list. It did not fit the budget, so every finding was pushed to "More".
    const runaway =
      "Eight problems: the since parameter is dead code, the empty object fails type checking, " +
      "getUTCHours groups by UTC instead of local time, numeric hour keys sort in the wrong " +
      "order so hour 10 renders before hour 2, hours with no commits are missing from the " +
      "output, invalid dates all collapse into one NaN bucket, and there is no sorting inside " +
      "a bucket.";

    const pieces = splitLong(runaway);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(28);
    }
    // Nothing is lost.
    expect(pieces.join(" ")).toBe(runaway);
  });

  test("keeps the commas attached, so it still reads naturally", () => {
    const pieces = splitLong("a".repeat(1) + " one, two, three, four", 2);
    expect(pieces[0]).toEndWith(",");
  });

  test("a long sentence with no commas is left whole rather than butchered", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    expect(splitLong(words)).toEqual([words]);
  });

  test("chunking applies it, so a runaway sentence becomes several chunks", () => {
    const runaway =
      "The first problem is here, the second problem is over there, the third problem is " +
      "somewhere else, the fourth problem is in another place entirely, and the fifth is here.";
    const chunks = toChunks([seg("did", runaway)]);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("dropRepeats", () => {
  const chunk = (text: string): Chunk => ({ text, pauseAfterMs: 0, field: "did" });

  test("drops a held-back sentence that repeats one already spoken", () => {
    // The reported bug: the model says a thing in `did`, says it again in `decision`, the
    // budget cuts between them, and "More" opens by repeating what you just heard.
    const spoken = [chunk("I converted three places in the formatter to local time.")];
    const rest = [
      chunk("One decision: I converted the three formatter places to local time instead."),
      chunk("Tests all pass now."),
    ];
    expect(dropRepeats(spoken, rest).map((c) => c.text)).toEqual(["Tests all pass now."]);
  });

  test("keeps genuinely new content", () => {
    const spoken = [chunk("I fixed the date formatter.")];
    const rest = [chunk("The staging database is still unreachable.")];
    expect(dropRepeats(spoken, rest)).toHaveLength(1);
  });

  test("short filler sentences are not treated as repeats of each other", () => {
    const spoken = [chunk("It works.")];
    const rest = [chunk("Tests pass.")];
    expect(dropRepeats(spoken, rest)).toHaveLength(1);
  });

  test("sentences differing only by a number are kept", () => {
    // The number is often the only thing that differs and the only thing that matters.
    // Stripping digits from the fingerprint made these identical and silently deleted one.
    const spoken = [chunk("Three tests failed in the formatter suite.")];
    const rest = [chunk("Two tests failed in the parser suite.")];
    expect(dropRepeats(spoken, rest)).toHaveLength(1);
  });

  test("nothing spoken means nothing is dropped", () => {
    const rest = [chunk("Anything at all here.")];
    expect(dropRepeats([], rest)).toHaveLength(1);
  });
});

describe("helpers", () => {
  test("chunkWords counts across chunks", () => {
    expect(chunkWords(toChunks([seg("did", "One two. Three four five.")]))).toBe(5);
  });

  test("chunkText rejoins", () => {
    expect(chunkText(toChunks([seg("did", "One. Two.")]))).toBe("One. Two.");
  });
});
