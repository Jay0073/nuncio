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

  test("a bash permission speaks in the first person and offers the options", () => {
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
      summary:
        "I want to run: Get-ChildItem -Force | Select-Object Name. " +
        "Allow once, allow for this session, or deny?",
    });
  });

  test("a long destructive command is described, not read out", () => {
    // The real 905-character case. Reading it aloud is two minutes of spoken punctuation.
    const [event] = translate({
      type: "permission.asked",
      properties: {
        id: "per_9",
        sessionID: "ses_1",
        permission: "bash",
        metadata: {
          command:
            '$base = "C:\\Users\\jay\\AppData\\Local\\Temp\\opencode\\standup-e2e"; ' +
            "if (Test-Path $base) { Remove-Item -Recurse -Force $base }; " +
            'New-Item -ItemType Directory -Path "$base\\alpha" -Force',
        },
      },
    });
    const summary = (event as { summary: string }).summary;
    expect(summary).toStartWith("I want to run a 3-step command");
    expect(summary).toContain("That is destructive.");
    expect(summary).not.toContain("AppData");
    expect(summary.length).toBeLessThan(260);
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
    expect(event).toMatchObject({
      summary: "I want to edit package.json. Allow once, allow for this session, or deny?",
    });
  });

  test("permission.replied uses requestID, not id", () => {
    expect(
      translate({
        type: "permission.replied",
        properties: { sessionID: "ses_1", requestID: "per_1", reply: "once" },
      }),
    ).toEqual([{ kind: "permission.answered", sessionId: "ses_1", permissionId: "per_1", reply: "once" }]);
  });

  test("a question is asked the way a colleague would ask it", () => {
    // Not a bare list. The event marks a recommended option and carries a description per
    // option, so nuncio can say what it would do and why before naming the alternatives.
    const [event] = translate({
      type: "question.asked",
      properties: {
        id: "que_1",
        sessionID: "ses_1",
        questions: [
          {
            question: "How should the CLI find the repositories?",
            options: [
              {
                label: "Scan current directory (Recommended)",
                description: "Recursively find .git folders under the working directory. Works well.",
              },
              { label: "Explicit paths as arguments", description: "User passes repo paths." },
            ],
          },
        ],
      },
    });
    expect(event).toEqual({
      kind: "question.asked",
      sessionId: "ses_1",
      questionId: "que_1",
      spoken:
        "How should the CLI find the repositories? I would go with Scan current directory — " +
        "Recursively find .git folders under the working directory. " +
        "The others are Explicit paths as arguments. Which one?",
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
