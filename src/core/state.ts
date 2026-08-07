/**
 * The conversation state machine.
 *
 * Pure. No I/O, no timers, no network. Everything is a function of the previous state and one
 * event. That is what makes the conversation flow testable, and the conversation flow is the
 * part most likely to need repeated tuning.
 *
 * See docs/02-tracks.md Track ATTENTION L2.
 *
 * The rule that matters: **nuncio never speaks unless the user opened the channel.**
 */

import type { NormalizedEvent } from "./events.ts";
import { buildReport, type Report } from "./report.ts";

export type State = "IDLE" | "WORKING" | "PENDING" | "SPEAKING";

/** Which sound to play. Three distinct tones mean you know what happened without looking. */
export type Ping = "done" | "needs-you" | "error";

export interface Waiting {
  ping: Ping;
  report: Report;
  /** Set when the agent is stopped until this is answered. */
  permissionId?: string;
  questionId?: string;
}

export interface NuncioState {
  state: State;
  /** The session nuncio is currently following. The most recently active one. */
  sessionId: string | null;
  /** What is waiting to be spoken, if anything. */
  waiting: Waiting | null;
  /** Files written during the current turn. Ground truth for the fallback report. */
  filesThisTurn: string[];
  /** The assistant's latest text for the current turn. */
  lastText: string | null;
  /** For the UI. Not used for decisions. */
  lastEventAt: number | null;
}

export const initialState: NuncioState = {
  state: "IDLE",
  sessionId: null,
  waiting: null,
  filesThisTurn: [],
  lastText: null,
  lastEventAt: null,
};

/** Things the browser page tells the daemon. */
export type UiEvent =
  /** The user opened the channel. This is the only thing that permits speech. */
  | { kind: "ui.open" }
  /** Playback finished, or the user dismissed it. */
  | { kind: "ui.done" };

export type Input = NormalizedEvent | UiEvent;

export function reduce(state: NuncioState, input: Input, now = 0): NuncioState {
  const next = { ...state, lastEventAt: now || state.lastEventAt };

  switch (input.kind) {
    case "ui.open":
      // Only meaningful when something is waiting. Otherwise ignore it.
      return state.waiting ? { ...next, state: "SPEAKING" } : state;

    case "ui.done":
      return { ...next, state: "IDLE", waiting: null };

    case "status": {
      const sessionId = input.sessionId;
      if (input.busy) {
        // OpenCode emits `busy` many times within a single turn, once per step. The v0 capture
        // had 204 status events for 12 turns. So this is NOT a turn boundary and must not clear
        // what the turn has accumulated — doing that wiped the assistant's text right before
        // the turn finished, and every report came out as the fallback.
        //
        // The accumulators are cleared when they are consumed, in `turn.finished`. The only
        // reason to clear them here is a switch to a different session.
        const switched = state.sessionId !== null && state.sessionId !== sessionId;
        return {
          ...next,
          state: "WORKING",
          sessionId,
          // A previous report is stale the moment new work starts.
          waiting: null,
          ...(switched ? { filesThisTurn: [], lastText: null } : {}),
        };
      }
      // Going quiet is not the finish signal on its own — `turn.finished` is. Staying in
      // WORKING here would be wrong, but so would clearing a pending question.
      if (next.state === "WORKING" && !next.waiting) {
        return { ...next, state: "IDLE", sessionId };
      }
      return { ...next, sessionId };
    }

    case "assistant.text":
      return { ...next, sessionId: input.sessionId, lastText: input.text };

    case "file.edited": {
      // `file.edited` carries no session id, so it is attributed to the session nuncio is
      // following. With one active session that is correct. With several it can misattribute.
      // Track REACH L2 fixes it.
      if (next.filesThisTurn.includes(input.path)) return next;
      return { ...next, filesThisTurn: [...next.filesThisTurn, input.path] };
    }

    case "turn.finished": {
      // A permission or question already put us in PENDING and is more urgent. Keep it.
      if (next.waiting?.permissionId || next.waiting?.questionId) {
        return { ...next, sessionId: input.sessionId };
      }
      const report = buildReport(next.lastText, next.filesThisTurn);
      return {
        ...next,
        state: "PENDING",
        sessionId: input.sessionId,
        waiting: { ping: report.needsYou ? "needs-you" : "done", report },
        // Consumed. The next turn starts from empty.
        filesThisTurn: [],
        lastText: null,
      };
    }

    case "permission.requested":
      return {
        ...next,
        state: "PENDING",
        sessionId: input.sessionId,
        waiting: {
          ping: "needs-you",
          permissionId: input.permissionId,
          report: {
            text: `${input.summary} ${optionsSentence(input.options)}`,
            source: "permission",
            needsYou: true,
            files: [],
          },
        },
      };

    case "question.asked":
      return {
        ...next,
        state: "PENDING",
        sessionId: input.sessionId,
        waiting: {
          ping: "needs-you",
          questionId: input.questionId,
          report: {
            text: `${input.question} ${optionsSentence(input.options)}`,
            source: "question",
            needsYou: true,
            files: [],
          },
        },
      };

    case "permission.answered":
      // Answered elsewhere, at the keyboard or in the web UI. Stop waiting on it.
      if (next.waiting?.permissionId === input.permissionId) {
        return { ...next, state: "IDLE", waiting: null };
      }
      return next;

    case "question.answered":
      if (next.waiting?.questionId === input.questionId) {
        return { ...next, state: "IDLE", waiting: null };
      }
      return next;

    case "error": {
      // The user pressing escape is not a failure. Sounding the error tone for it would train
      // the user to ignore the error tone.
      if (input.userAborted) {
        return { ...next, state: "IDLE", sessionId: input.sessionId, waiting: null };
      }
      return {
        ...next,
        state: "PENDING",
        sessionId: input.sessionId,
        waiting: {
          ping: "error",
          report: {
            text: `Something went wrong. ${input.message}`,
            source: "error",
            needsYou: true,
            files: [],
          },
        },
      };
    }
  }
}

function optionsSentence(options: string[]): string {
  if (options.length === 0) return "";
  if (options.length === 1) return `The only option is ${options[0]}.`;
  const last = options.at(-1)!;
  return `Your options are ${options.slice(0, -1).join(", ")}, or ${last}.`;
}
