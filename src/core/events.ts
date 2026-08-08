/**
 * The normalised event set and the adapter interface.
 *
 * See docs/04-architecture.md and D-017.
 *
 * The load-bearing rule: **adapters push events into nuncio. nuncio never pulls from an
 * adapter.** OpenCode is a stream you subscribe to. Claude Code is a set of hooks that call
 * you. A pull-shaped core cannot host Claude Code without a rewrite. A push-shaped core hosts
 * both — the OpenCode adapter runs its SSE loop internally and emits; a Claude Code adapter
 * would run a local endpoint its hooks post to, and emit the same events.
 *
 * Add an event kind only when a version needs it.
 */

export interface FileChange {
  /** File name only, for speech. The full path is in `path`. */
  name: string;
  path: string;
}

export type NormalizedEvent =
  /** A turn started or ended. `busy` is the WORKING signal. */
  | { kind: "status"; sessionId: string; busy: boolean }
  /** The assistant's finished text for a turn. The <<SPEAK>> block lives in here. */
  | { kind: "assistant.text"; sessionId: string; text: string }
  /** The agent stopped and is waiting. Nothing else is coming. */
  | { kind: "turn.finished"; sessionId: string }
  /** A file was written. Ground truth for the fallback report. */
  | { kind: "file.edited"; sessionId: string | null; path: string }
  /** The agent needs approval before it can continue. Until answered, it is stopped. */
  | {
      kind: "permission.requested";
      sessionId: string;
      permissionId: string;
      /** "bash", "edit", and so on. */
      tool: string;
      /** Already written for speech, in the first person, with detail scaled by risk. */
      summary: string;
      options: string[];
    }
  | { kind: "permission.answered"; sessionId: string; permissionId: string; reply: string }
  /**
   * A structured multiple-choice question from the agent. Distinct from a permission.
   * Already phrased for speech by the adapter, including which option it recommends and why.
   */
  | {
      kind: "question.asked";
      sessionId: string;
      questionId: string;
      /** The whole thing, ready to speak. */
      spoken: string;
      /** The bare labels, for the screen and for matching a spoken answer in v2. */
      options: string[];
    }
  | { kind: "question.answered"; sessionId: string; questionId: string }
  | {
      kind: "error";
      sessionId: string;
      name: string;
      message: string;
      /** True when the user pressed escape. Not a failure — do not sound the error ping. */
      userAborted: boolean;
    };

export type EventKind = NormalizedEvent["kind"];

/**
 * What an adapter can actually do.
 *
 * Do not design for the weakest CLI. Let each adapter declare what it supports and let nuncio
 * degrade honestly. If `answerPermission` is false, nuncio still pings and still reads the
 * question aloud — it just says to answer at the keyboard.
 */
export interface AgentCapabilities {
  sendPrompt: boolean;
  abort: boolean;
  answerPermission: boolean;
  answerQuestion: boolean;
  installContract: boolean;
}

export type Emit = (event: NormalizedEvent) => void;

export interface AgentAdapter {
  readonly name: string;
  readonly capabilities: AgentCapabilities;

  /** Begin pushing events. Resolves once connected; keeps running until `stop`. */
  start(emit: Emit): Promise<void>;
  stop(): Promise<void>;

  sendPrompt(sessionId: string, text: string): Promise<void>;
  abort(sessionId: string): Promise<void>;
  answerPermission(sessionId: string, permissionId: string, reply: string): Promise<void>;
}
