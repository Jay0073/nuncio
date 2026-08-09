import { describe, expect, test } from "bun:test";
import { budgetFor, countWords, splitSentences, trimToBudget } from "./budget.ts";

describe("budgetFor", () => {
  test("a code-change turn is kept concise, and scales with how much changed", () => {
    // The diff is on screen. You can read it. The report does not need to be the whole story.
    expect(budgetFor(1)).toBe(70);
    expect(budgetFor(3)).toBe(70);
    expect(budgetFor(4)).toBe(100);
    expect(budgetFor(40)).toBe(100);
  });

  test("a turn that changed nothing gets the MOST room, not the least", () => {
    // Regression. The first version gave a no-change turn 45 words, the smallest budget. But an
    // audit changes no files and is the longest report type — asked to review a function, the
    // agent found seven real problems and only two of them fitted. There is nothing on screen
    // to read instead, so the words are the deliverable.
    expect(budgetFor(0)).toBe(90);
    expect(budgetFor(0)).toBeGreaterThan(budgetFor(2));
  });
});

describe("trimToBudget", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

  test("leaves a short report completely alone", () => {
    const result = trimToBudget("Short and fine.", 45);
    expect(result.spoken).toBe("Short and fine.");
    expect(result.rest).toBe("");
  });

  test("nothing is offered when nothing was cut", () => {
    // "There is more" must not appear on every report — only when there really is more.
    expect(trimToBudget(`${words(20)}.`, 45).rest).toBe("");
  });

  test("cuts on a sentence boundary, never mid-sentence", () => {
    const text = "First sentence here. Second sentence here. Third sentence here.";
    const result = trimToBudget(text, 5);
    expect(result.spoken).toBe("First sentence here.");
    expect(result.rest).toBe("Second sentence here. Third sentence here.");
  });

  test("keeps the first sentence whole even when it alone blows the budget", () => {
    // Speaking half a sentence is worse than running slightly long.
    const text = `${words(60)}. Second one.`;
    const result = trimToBudget(text, 10);
    expect(countWords(result.spoken)).toBe(60);
    expect(result.rest).toBe("Second one.");
  });

  test("the two halves together are the whole report", () => {
    const text = "One two three. Four five six. Seven eight nine.";
    const { spoken, rest } = trimToBudget(text, 4);
    expect(`${spoken} ${rest}`.trim()).toBe(text);
  });

  test("handles empty input", () => {
    expect(trimToBudget("   ", 45)).toEqual({ spoken: "", rest: "" });
  });

  test("text with no sentence punctuation is kept whole rather than chopped", () => {
    const text = words(80);
    const result = trimToBudget(text, 10);
    expect(result.spoken).toBe(text);
    expect(result.rest).toBe("");
  });

  test("a question mark ends a sentence too", () => {
    const result = trimToBudget("Which one do you want? I would pick the first.", 5);
    expect(result.spoken).toBe("Which one do you want?");
  });
});

describe("splitSentences", () => {
  test("keeps the punctuation", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  test("keeps a trailing fragment", () => {
    expect(splitSentences("One. And then")).toEqual(["One.", "And then"]);
  });
});
