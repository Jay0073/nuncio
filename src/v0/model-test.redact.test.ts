import { describe, expect, test } from "bun:test";
import { redact } from "./model-test.ts";

describe("redact", () => {
  test("removes values under a secret-looking key", () => {
    const input = { id: "opencode", key: "sk-abc", options: {} };
    expect(redact(input)).toEqual({ id: "opencode", key: "[redacted]", options: {} });
  });

  test("removes a secret found in the middle of a string, keeping the rest", () => {
    const input = { note: "use sk-8co3LjfLy3t0FfjTCVfJ9xgkLbUT0u5le1SAwO9TtQX42DaB2Xgnutyt now" };
    expect(redact(input)).toEqual({ note: "use [redacted] now" });
  });

  test("removes every secret in a string, not only the first", () => {
    const input = "old sk-AAAAAAAAAAAAAAAAAAAA and new sk-BBBBBBBBBBBBBBBBBBBB";
    expect(redact(input)).toBe("old [redacted] and new [redacted]");
  });

  test("leaves short strings that merely start with sk alone", () => {
    expect(redact({ name: "skip" })).toEqual({ name: "skip" });
  });

  test("reaches into nested objects and arrays", () => {
    const input = { providers: [{ name: "zen", apiKey: "sk-live-1234567890abcdef" }] };
    expect(redact(input)).toEqual({ providers: [{ name: "zen", apiKey: "[redacted]" }] });
  });

  test("leaves ordinary content alone", () => {
    const input = { model: "opencode/big-pickle", runs: 10, ok: true, text: "done: Shipped it." };
    expect(redact(input)).toEqual(input);
  });

  test("does not choke on null or undefined", () => {
    expect(redact({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });
});
