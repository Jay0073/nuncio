import { describe, expect, test } from "bun:test";
import type { NormalizedEvent } from "./events.ts";
import { initialState, reduce, type Input, type NuncioState } from "./state.ts";

const S = "ses_1";

const head = (s: NuncioState) => s.queue[0];

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
    expect(head(state)?.ping).toBe("done");
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
    expect(head(state)).toBeUndefined();
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
    expect(head(state)?.report.source).toBe("block");
    expect(head(state)?.report.text).toBe("Removed the helper, 20 tests pass.");
    expect(head(state)?.report.files).toEqual(["one.ts"]);
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
    expect(head(state)?.report.text).toBe("Second.");
    expect(head(state)?.report.files).toEqual([]);
  });

  test("starting new work clears the previous report", () => {
    const state = run(busy(true), text(block("did: Done.")), finished, busy(true));
    expect(state.state).toBe("WORKING");
    expect(head(state)).toBeUndefined();
  });

  test("switching to a different session drops the old session's text", () => {
    const state = run(
      busy(true),
      text(block("did: Session one.")),
      { kind: "status", sessionId: "ses_2", busy: true },
      { kind: "turn.finished", sessionId: "ses_2" },
    );
    expect(head(state)?.report.source).toBe("fallback");
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
    expect(head(state)?.report.source).toBe("fallback");
  });

  test("an ask in the block raises the needs-you tone, not the done tone", () => {
    const state = run(busy(true), text(block("did: Set up auth.\nask: Postgres or SQLite?")), finished);
    expect(head(state)?.ping).toBe("needs-you");
  });
});

describe("permissions and questions", () => {
  const permission = (id = "per_1"): NormalizedEvent => ({
    kind: "permission.requested",
    sessionId: S,
    permissionId: id,
    tool: "bash",
    summary: "I want to run: rm -rf build. Allow once, allow for this session, or deny?",
    options: ["once", "always", "reject"],
  });

  test("a permission request waits, with the needs-you tone", () => {
    const state = run(busy(true), permission());
    expect(state.state).toBe("PENDING");
    expect(head(state)?.ping).toBe("needs-you");
    expect(head(state)?.permissionId).toBe("per_1");
    // The adapter already phrased it for speech. The state machine speaks it verbatim.
    expect(head(state)?.report.text).toStartWith("I want to run");
  });

  test("a permission survives the busy events that follow it", () => {
    // Regression from real use. `busy` fires about 17 times per turn, and clearing the waiting
    // item on every one made spoken questions and permissions disappear before they were heard.
    const state = run(busy(true), permission(), busy(true), busy(true));
    expect(head(state)?.permissionId).toBe("per_1");
  });

  test("several permissions in flight are all kept", () => {
    // The capture shows `permission.asked` immediately followed by another. A single slot
    // silently dropped all but the last.
    const state = run(busy(true), permission("per_1"), permission("per_2"), permission("per_3"));
    expect(state.queue.map((w) => w.permissionId)).toEqual(["per_1", "per_2", "per_3"]);
  });

  test("the same permission arriving twice is not queued twice", () => {
    const state = run(busy(true), permission("per_1"), permission("per_1"));
    expect(state.queue).toHaveLength(1);
  });

  test("a report queues behind a permission, because the agent is stopped", () => {
    const state = run(busy(true), permission(), text(block("did: Done.")), finished);
    expect(head(state)?.permissionId).toBe("per_1");
    expect(state.queue).toHaveLength(2);
    expect(state.queue[1]?.report.source).toBe("block");
  });

  test("dismissing the head moves on to the next item", () => {
    const state = run(
      busy(true),
      permission("per_1"),
      permission("per_2"),
      { kind: "ui.open" },
      { kind: "ui.done" },
    );
    expect(head(state)?.permissionId).toBe("per_2");
    expect(state.state).toBe("PENDING");
  });

  test("a pending permission survives the turn finishing", () => {
    // The agent is stopped until it is answered, so it must not be replaced by a report.
    const state = run(busy(true), permission(), finished);
    expect(head(state)?.permissionId).toBe("per_1");
  });

  test("answering it at the keyboard clears the wait", () => {
    const state = run(busy(true), permission(), {
      kind: "permission.answered",
      sessionId: S,
      permissionId: "per_1",
      reply: "once",
    });
    expect(state.state).toBe("IDLE");
    expect(head(state)).toBeUndefined();
  });

  test("an answer for a different permission is ignored", () => {
    const state = run(busy(true), permission(), {
      kind: "permission.answered",
      sessionId: S,
      permissionId: "per_other",
      reply: "once",
    });
    expect(head(state)?.permissionId).toBe("per_1");
  });

  test("a question is spoken as the adapter phrased it", () => {
    const state = run(busy(true), {
      kind: "question.asked",
      sessionId: S,
      questionId: "que_1",
      spoken: "How should the CLI find repositories? I would go with Scan current directory. Which one?",
      options: ["Scan current directory", "Explicit paths", "Config file"],
    });
    expect(head(state)?.ping).toBe("needs-you");
    expect(head(state)?.report.text).toStartWith("How should the CLI find repositories?");
  });

  test("a question survives the busy events that follow it", () => {
    const state = run(
      busy(true),
      { kind: "question.asked", sessionId: S, questionId: "que_1", spoken: "Which one?", options: [] },
      busy(true),
      busy(true),
    );
    expect(head(state)?.questionId).toBe("que_1");
  });
});

describe("the speech budget", () => {
  const long = (n: number) =>
    Array.from({ length: n }, (_, i) => `Sentence number ${i} here.`).join(" ");

  test("a long report is cut and the rest is held", () => {
    const state = run(busy(true), text(block(`did: ${long(40)}`)), finished);
    const report = head(state)!.report;
    expect(report.rest).not.toBe("");
    expect(report.fullWords).toBeGreaterThan(45);
  });

  test("a short report offers nothing more", () => {
    const state = run(busy(true), text(block("did: All 20 tests pass.")), finished);
    expect(head(state)!.report.rest).toBe("");
    expect(head(state)!.report.fullWords).toBeUndefined();
  });

  test("asking for more reads from memory, it does not fetch anything", () => {
    const before = run(busy(true), text(block(`did: ${long(40)}`)), finished);
    const rest = head(before)!.report.rest;
    const after = reduce(before, { kind: "ui.more" }, 1);

    expect(after.state).toBe("SPEAKING");
    expect(head(after)!.report.text).toBe(rest);
    expect(head(after)!.report.rest).toBe("");
  });

  test("asking for more when there is none does nothing", () => {
    const before = run(busy(true), text(block("did: Short.")), finished);
    expect(reduce(before, { kind: "ui.more" }, 1)).toBe(before);
  });

  test("the budget grows with the number of files changed", () => {
    const files = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        kind: "file.edited" as const,
        sessionId: null,
        path: `/a/file${i}.ts`,
      }));

    const small = run(busy(true), text(block(`did: ${long(40)}`)), finished);
    const big = run(busy(true), ...files(6), text(block(`did: ${long(40)}`)), finished);

    expect(head(big)!.report.text.length).toBeGreaterThan(head(small)!.report.text.length);
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
    expect(head(state)?.ping).toBe("error");
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
    expect(head(state)).toBeUndefined();
  });
});

describe("reducer hygiene", () => {
  test("it does not mutate the state passed in", () => {
    const before = { ...initialState };
    reduce(initialState, busy(true), 1);
    expect(initialState).toEqual(before);
  });
});
