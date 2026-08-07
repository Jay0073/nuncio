import { describe, expect, test } from "bun:test";
import type { NormalizedEvent } from "./events.ts";
import { initialState, reduce, type Input, type NuncioState } from "./state.ts";

const S = "ses_1";

function run(...inputs: Input[]): NuncioState {
  return inputs.reduce((state, input) => reduce(state, input, 1), initialState);
}

const busy = (b: boolean): NormalizedEvent => ({ kind: "status", sessionId: S, busy: b });
const text = (t: string): NormalizedEvent => ({ kind: "assistant.text", sessionId: S, text: t });
const finished: NormalizedEvent = { kind: "turn.finished", sessionId: S };
const block = (body: string) => `response\n<<SPEAK>>\n${body}\n<<END>>`;

describe("the rule: nuncio never speaks unless the channel was opened", () => {
  test("a finished turn goes to PENDING, not SPEAKING", () => {
    const state = run(busy(true), text(block("did: Done.")), finished);
    expect(state.state).toBe("PENDING");
    expect(state.waiting?.ping).toBe("done");
  });

  test("only ui.open reaches SPEAKING", () => {
    const state = run(busy(true), text(block("did: Done.")), finished, { kind: "ui.open" });
    expect(state.state).toBe("SPEAKING");
  });

  test("ui.open with nothing waiting does nothing", () => {
    expect(run({ kind: "ui.open" }).state).toBe("IDLE");
  });

  test("ui.done clears the waiting item", () => {
    const state = run(busy(true), text(block("did: Done.")), finished, { kind: "ui.open" }, { kind: "ui.done" });
    expect(state.state).toBe("IDLE");
    expect(state.waiting).toBeNull();
  });
});

describe("turn lifecycle", () => {
  test("repeated busy events inside one turn do not wipe the accumulated text", () => {
    // Regression. OpenCode emits `busy` once per step — 204 status events for 12 turns in the
    // v0 capture. Treating each one as a new turn cleared the assistant's text just before the
    // turn finished, so every report came out as the fallback.
    const state = run(
      busy(true),
      text(block("did: Removed the helper, 20 tests pass.")),
      { kind: "file.edited", sessionId: null, path: "/a/one.ts" },
      busy(true),
      busy(true),
      finished,
    );
    expect(state.waiting?.report.source).toBe("block");
    expect(state.waiting?.report.text).toBe("Removed the helper, 20 tests pass.");
    expect(state.waiting?.report.files).toEqual(["one.ts"]);
  });

  test("finishing a turn consumes the accumulators", () => {
    const state = run(
      busy(true),
      text(block("did: First turn.")),
      { kind: "file.edited", sessionId: null, path: "/a/one.ts" },
      finished,
    );
    expect(state.filesThisTurn).toEqual([]);
    expect(state.lastText).toBeNull();
  });

  test("a second turn does not inherit the first turn's files", () => {
    const state = run(
      busy(true),
      text(block("did: First.")),
      { kind: "file.edited", sessionId: null, path: "/a/one.ts" },
      finished,
      busy(true),
      text(block("did: Second.")),
      finished,
    );
    expect(state.waiting?.report.text).toBe("Second.");
    expect(state.waiting?.report.files).toEqual([]);
  });

  test("starting new work clears the previous report", () => {
    const state = run(busy(true), text(block("did: Done.")), finished, busy(true));
    expect(state.state).toBe("WORKING");
    expect(state.waiting).toBeNull();
  });

  test("switching to a different session drops the old session's text", () => {
    const state = run(
      busy(true),
      text(block("did: Session one.")),
      { kind: "status", sessionId: "ses_2", busy: true },
      { kind: "turn.finished", sessionId: "ses_2" },
    );
    expect(state.waiting?.report.source).toBe("fallback");
  });

  test("edited files accumulate and are de-duplicated", () => {
    const state = run(
      busy(true),
      { kind: "file.edited", sessionId: null, path: "/a/one.ts" },
      { kind: "file.edited", sessionId: null, path: "/a/one.ts" },
      { kind: "file.edited", sessionId: null, path: "/a/two.ts" },
    );
    expect(state.filesThisTurn).toEqual(["/a/one.ts", "/a/two.ts"]);
  });

  test("the fallback is used when the agent wrote no block", () => {
    const state = run(busy(true), text("no block here"), finished);
    expect(state.waiting?.report.source).toBe("fallback");
  });

  test("an ask in the block raises the needs-you tone, not the done tone", () => {
    const state = run(busy(true), text(block("did: Set up auth.\nask: Postgres or SQLite?")), finished);
    expect(state.waiting?.ping).toBe("needs-you");
  });
});

describe("permissions and questions", () => {
  const permission: NormalizedEvent = {
    kind: "permission.requested",
    sessionId: S,
    permissionId: "per_1",
    tool: "bash",
    summary: "It wants to run: rm -rf build.",
    options: ["once", "always", "reject"],
  };

  test("a permission request waits, with the needs-you tone", () => {
    const state = run(busy(true), permission);
    expect(state.state).toBe("PENDING");
    expect(state.waiting?.ping).toBe("needs-you");
    expect(state.waiting?.permissionId).toBe("per_1");
    expect(state.waiting?.report.text).toContain("Your options are once, always, or reject.");
  });

  test("a pending permission survives the turn finishing", () => {
    // The agent is stopped until it is answered, so it must not be replaced by a report.
    const state = run(busy(true), permission, finished);
    expect(state.waiting?.permissionId).toBe("per_1");
  });

  test("answering it at the keyboard clears the wait", () => {
    const state = run(busy(true), permission, {
      kind: "permission.answered",
      sessionId: S,
      permissionId: "per_1",
      reply: "once",
    });
    expect(state.state).toBe("IDLE");
    expect(state.waiting).toBeNull();
  });

  test("an answer for a different permission is ignored", () => {
    const state = run(busy(true), permission, {
      kind: "permission.answered",
      sessionId: S,
      permissionId: "per_other",
      reply: "once",
    });
    expect(state.waiting?.permissionId).toBe("per_1");
  });

  test("a structured question reads its options aloud", () => {
    const state = run(busy(true), {
      kind: "question.asked",
      sessionId: S,
      questionId: "que_1",
      question: "How should the CLI find repositories?",
      options: ["Scan current directory", "Explicit paths", "Config file"],
    });
    expect(state.waiting?.ping).toBe("needs-you");
    expect(state.waiting?.report.text).toBe(
      "How should the CLI find repositories? Your options are Scan current directory, Explicit paths, or Config file.",
    );
  });
});

describe("errors", () => {
  test("a real error raises the error tone", () => {
    const state = run(busy(true), {
      kind: "error",
      sessionId: S,
      name: "ProviderError",
      message: "rate limited",
      userAborted: false,
    });
    expect(state.waiting?.ping).toBe("error");
  });

  test("the user pressing escape is not an error", () => {
    // Sounding the error tone for a deliberate abort would train the user to ignore that tone.
    const state = run(busy(true), {
      kind: "error",
      sessionId: S,
      name: "MessageAbortedError",
      message: "Aborted",
      userAborted: true,
    });
    expect(state.state).toBe("IDLE");
    expect(state.waiting).toBeNull();
  });
});

describe("reducer hygiene", () => {
  test("it does not mutate the state passed in", () => {
    const before = { ...initialState };
    reduce(initialState, busy(true), 1);
    expect(initialState).toEqual(before);
  });
});
