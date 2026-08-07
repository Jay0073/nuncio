/**
 * Every payload here was copied from the real 26,194-event v0 capture, not invented. If
 * OpenCode changes a shape, these tests are what will notice.
 */

import { describe, expect, test } from "bun:test";
import { translate } from "./opencode.ts";

describe("translate", () => {
  test("session.status carries the busy signal", () => {
    expect(
      translate({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } }),
    ).toEqual([{ kind: "status", sessionId: "ses_1", busy: true }]);

    expect(
      translate({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "idle" } } }),
    ).toEqual([{ kind: "status", sessionId: "ses_1", busy: false }]);
  });

  test("session.idle is the finished-turn signal and carries nothing else", () => {
    expect(translate({ type: "session.idle", properties: { sessionID: "ses_1" } })).toEqual([
      { kind: "turn.finished", sessionId: "ses_1" },
    ]);
  });

  test("a text part is the assistant's answer", () => {
    expect(
      translate({
        type: "message.part.updated",
        properties: { sessionID: "ses_1", part: { type: "text", text: "the answer" } },
      }),
    ).toEqual([{ kind: "assistant.text", sessionId: "ses_1", text: "the answer" }]);
  });

  test("tool, reasoning and step parts are silent", () => {
    for (const type of ["tool", "reasoning", "step-start", "step-finish"]) {
      expect(
        translate({ type: "message.part.updated", properties: { sessionID: "ses_1", part: { type } } }),
      ).toEqual([]);
    }
  });

  test("file.edited has no session id", () => {
    expect(
      translate({ type: "file.edited", properties: { file: "C:\\p\\standup\\package.json" } }),
    ).toEqual([{ kind: "file.edited", sessionId: null, path: "C:\\p\\standup\\package.json" }]);
  });

  test("a bash permission speaks the actual command", () => {
    const [event] = translate({
      type: "permission.asked",
      properties: {
        id: "per_1",
        sessionID: "ses_1",
        permission: "bash",
        metadata: { command: "Get-ChildItem -Force | Select-Object Name" },
      },
    });
    expect(event).toMatchObject({
      kind: "permission.requested",
      permissionId: "per_1",
      tool: "bash",
      summary: "It wants to run: Get-ChildItem -Force | Select-Object Name.",
    });
  });

  test("an edit permission speaks the file name, not the whole path", () => {
    const [event] = translate({
      type: "permission.asked",
      properties: {
        id: "per_2",
        sessionID: "ses_1",
        permission: "edit",
        metadata: { filepath: "C:\\Users\\jay\\Documents\\projects\\standup\\package.json" },
      },
    });
    expect(event).toMatchObject({ summary: "It wants to edit package.json." });
  });

  test("permission.replied uses requestID, not id", () => {
    expect(
      translate({
        type: "permission.replied",
        properties: { sessionID: "ses_1", requestID: "per_1", reply: "once" },
      }),
    ).toEqual([{ kind: "permission.answered", sessionId: "ses_1", permissionId: "per_1", reply: "once" }]);
  });

  test("a structured question keeps its option labels but drops (Recommended)", () => {
    const [event] = translate({
      type: "question.asked",
      properties: {
        id: "que_1",
        sessionID: "ses_1",
        questions: [
          {
            question: "How should the CLI find the repositories?",
            options: [
              { label: "Scan current directory (Recommended)" },
              { label: "Explicit paths as arguments" },
            ],
          },
        ],
      },
    });
    expect(event).toEqual({
      kind: "question.asked",
      sessionId: "ses_1",
      questionId: "que_1",
      question: "How should the CLI find the repositories?",
      options: ["Scan current directory", "Explicit paths as arguments"],
    });
  });

  test("an abort is marked so it does not sound like a failure", () => {
    const [event] = translate({
      type: "session.error",
      properties: {
        sessionID: "ses_1",
        error: { name: "MessageAbortedError", data: { message: "Aborted" } },
      },
    });
    expect(event).toMatchObject({ kind: "error", userAborted: true });
  });

  test("a real error is not marked as an abort", () => {
    const [event] = translate({
      type: "session.error",
      properties: { sessionID: "ses_1", error: { name: "ProviderError", data: { message: "429" } } },
    });
    expect(event).toMatchObject({ kind: "error", userAborted: false, message: "429" });
  });

  test("noisy and unknown events are dropped", () => {
    for (const type of ["server.heartbeat", "plugin.added", "message.part.delta", "who.knows"]) {
      expect(translate({ type, properties: {} })).toEqual([]);
    }
  });

  test("a malformed event does not throw", () => {
    expect(translate({})).toEqual([]);
    expect(translate({ type: "session.idle" })).toEqual([]);
    expect(translate({ type: "session.status", properties: { sessionID: "ses_1" } })).toEqual([]);
  });
});
