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
  /** Set when the agent is stopped until this is answered. Such items are never dropped. */
  permissionId?: string;
  questionId?: string;
}

export interface NuncioState {
  state: State;
  /** The session nuncio is currently following. The most recently active one. */
  sessionId: string | null;
  /**
   * Everything waiting to be spoken, most urgent first.
   *
   * A queue rather than one slot because the capture shows `permission.asked` immediately
   * followed by another `permission.asked` — several can be in flight, and a single slot
   * silently dropped all but the last.
   */
  queue: Waiting[];
  /** Files written during the current turn. Ground truth for the fallback report. */
  filesThisTurn: string[];
  /** The assistant's latest text for the current turn. */
  lastText: string | null;
  lastEventAt: number | null;
}

export const initialState: NuncioState = {
  state: "IDLE",
  sessionId: null,
  queue: [],
  filesThisTurn: [],
  lastText: null,
  lastEventAt: null,
};

/** Things the browser page tells the daemon. */
export type UiEvent =
  /** The user opened the channel. This is the only thing that permits speech. */
  | { kind: "ui.open" }
  /** The user asked for the part that was held back by the budget. Read from memory (D-024). */
  | { kind: "ui.more" }
  /** Playback finished, or the user dismissed it. */
  | { kind: "ui.done" };

export type Input = NormalizedEvent | UiEvent;

/** An item that blocks the agent must never be dropped to make room for a report. */
function blocking(item: Waiting): boolean {
  return item.permissionId !== undefined || item.questionId !== undefined;
}

function settle(state: NuncioState): NuncioState {
  if (state.state === "SPEAKING") return state;
  if (state.queue.length > 0) return { ...state, state: "PENDING" };
  if (state.state === "PENDING") return { ...state, state: "IDLE" };
  return state;
}

export function reduce(state: NuncioState, input: Input, now = 0): NuncioState {
  const next: NuncioState = { ...state, lastEventAt: now || state.lastEventAt };
  const head = state.queue[0];

  switch (input.kind) {
    case "ui.open":
      return head ? { ...next, state: "SPEAKING" } : state;

    case "ui.more": {
      // The rest was already written by the agent and is already in memory. Nothing is fetched
      // and nothing is asked again, so this cannot drift from what was actually said.
      if (!head || head.report.rest === "") return state;
      const promoted: Waiting = {
        ...head,
        report: { ...head.report, text: head.report.rest, rest: "" },
      };
      return { ...next, state: "SPEAKING", queue: [promoted, ...state.queue.slice(1)] };
    }

    case "ui.done":
      if (!head) return { ...next, state: "IDLE" };
      return settle({ ...next, state: "IDLE", queue: state.queue.slice(1) });

    case "status": {
      const sessionId = input.sessionId;
      if (input.busy) {
        // OpenCode emits `busy` many times within a single turn, once per step — 204 status
        // events for 12 turns in the v0 capture. This is NOT a turn boundary. Clearing the
        // accumulators here wiped the assistant's text right before the turn finished.
        //
        // A previous *report* is stale once new work starts, so those are dropped. Permissions
        // and questions are not: the agent is stopped until they are answered, and dropping one
        // is what made spoken questions disappear in v1.
        const switched = state.sessionId !== null && state.sessionId !== sessionId;
        return settle({
          ...next,
          state: "WORKING",
          sessionId,
          queue: state.queue.filter(blocking),
          ...(switched ? { filesThisTurn: [], lastText: null } : {}),
        });
      }
      if (next.state === "WORKING" && state.queue.length === 0) {
        return { ...next, state: "IDLE", sessionId };
      }
      return { ...next, sessionId };
    }

    case "assistant.text":
      return { ...next, sessionId: input.sessionId, lastText: input.text };

    case "file.edited": {
      // `file.edited` carries no session id, so it is attributed to the session nuncio is
      // following. With one active session that is correct. Track REACH L2 fixes the rest.
      if (state.filesThisTurn.includes(input.path)) return state;
      return { ...next, filesThisTurn: [...state.filesThisTurn, input.path] };
    }

    case "turn.finished": {
      const report = buildReport(state.lastText, state.filesThisTurn);
      const item: Waiting = { ping: report.needsYou ? "needs-you" : "done", report };
      return settle({
        ...next,
        sessionId: input.sessionId,
        // Behind anything that is blocking the agent — those matter more than a summary.
        queue: [...state.queue, item],
        // Consumed. The next turn starts from empty.
        filesThisTurn: [],
        lastText: null,
      });
    }

    case "permission.requested": {
      if (state.queue.some((w) => w.permissionId === input.permissionId)) return state;
      const item: Waiting = {
        ping: "needs-you",
        permissionId: input.permissionId,
        report: {
          text: input.summary,
          rest: "",
          source: "permission",
          needsYou: true,
          files: [],
        },
      };
      return settle({ ...next, sessionId: input.sessionId, queue: [...state.queue, item] });
    }

    case "question.asked": {
      if (state.queue.some((w) => w.questionId === input.questionId)) return state;
      const item: Waiting = {
        ping: "needs-you",
        questionId: input.questionId,
        report: { text: input.spoken, rest: "", source: "question", needsYou: true, files: [] },
      };
      return settle({ ...next, sessionId: input.sessionId, queue: [...state.queue, item] });
    }

    case "permission.answered":
      return settle({
        ...next,
        state: state.state === "SPEAKING" ? "SPEAKING" : state.state,
        queue: state.queue.filter((w) => w.permissionId !== input.permissionId),
      });

    case "question.answered":
      return settle({
        ...next,
        queue: state.queue.filter((w) => w.questionId !== input.questionId),
      });

    case "error": {
      // The user pressing escape is not a failure. Sounding the error tone for it would train
      // the user to ignore the error tone.
      if (input.userAborted) {
        // The agent has stopped, so WORKING is no longer true. Anything still blocking it
        // stays — an abort does not answer a pending permission.
        return settle({
          ...next,
          state: "IDLE",
          sessionId: input.sessionId,
          queue: state.queue.filter(blocking),
        });
      }
      const item: Waiting = {
        ping: "error",
        report: {
          text: `Something went wrong. ${input.message}`,
          rest: "",
          source: "error",
          needsYou: true,
          files: [],
        },
      };
      return settle({ ...next, sessionId: input.sessionId, queue: [...state.queue, item] });
    }
  }
}
