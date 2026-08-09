/**
 * The OpenCode adapter.
 *
 * Subscribes to `GET /event` and pushes normalised events into nuncio. All the OpenCode-shaped
 * knowledge lives here and nowhere else.
 *
 * Every mapping below was taken from a real 26,194-event capture, not from documentation.
 * See docs/06-research.md.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { AgentAdapter, AgentCapabilities, Emit, NormalizedEvent } from "../core/events.ts";
import { fileName } from "../core/report.ts";
import {
  describeBash,
  describeEdit,
  describeQuestion,
  permissionOptions,
  type QuestionOption,
} from "./describe.ts";

type Client = ReturnType<typeof createOpencodeClient>;

interface RawEvent {
  type?: string;
  properties?: Record<string, unknown>;
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly name = "opencode";

  readonly capabilities: AgentCapabilities = {
    sendPrompt: true,
    abort: true,
    answerPermission: true,
    // `question.asked` has no confirmed reply endpoint yet. Answer it in the TUI for now.
    answerQuestion: false,
    installContract: true,
  };

  private client: Client;
  private running = false;

  constructor(private baseUrl: string) {
    this.client = createOpencodeClient({ baseUrl });
  }

  /** Warn when the server is not rooted in a real project. See D-019. */
  async checkProject(): Promise<{ ok: boolean; worktree: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/project/current`);
      const project = (await response.json()) as { worktree?: string };
      const worktree = project.worktree ?? "?";
      return { ok: worktree !== "/" && worktree !== "", worktree };
    } catch {
      return { ok: false, worktree: "unreachable" };
    }
  }

  async start(emit: Emit): Promise<void> {
    this.running = true;
    let failures = 0;

    while (this.running) {
      try {
        const events = await this.client.event.subscribe();
        failures = 0;
        for await (const raw of events.stream) {
          if (!this.running) break;
          const mapped = translate(raw as RawEvent);
          for (const event of mapped) emit(event);
        }
      } catch {
        // Server restarted, laptop slept, network blipped. Reconnect rather than die.
      }
      if (!this.running) break;
      failures++;
      await sleep(Math.min(30_000, 1000 * 2 ** failures));
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async sendPrompt(sessionId: string, text: string): Promise<void> {
    await this.client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: "text", text }] },
    } as never);
  }

  async abort(sessionId: string): Promise<void> {
    await this.client.session.abort({ path: { id: sessionId } });
  }

  async answerPermission(sessionId: string, permissionId: string, reply: string): Promise<void> {
    // The REST docs say `{ response, remember? }`; the SDK docs say `{ allow: true }`. The
    // capture shows replies of the form `{ reply: "once" }`. Unresolved until v2 tests it, so
    // this goes over plain HTTP where the body is easy to change.
    await fetch(`${this.baseUrl}/session/${sessionId}/permissions/${permissionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: reply }),
    });
  }
}

/** One raw OpenCode event becomes zero, one, or several normalised events. */
export function translate(raw: RawEvent): NormalizedEvent[] {
  const p = raw.properties ?? {};
  const sessionId = typeof p.sessionID === "string" ? p.sessionID : "";

  switch (raw.type) {
    // `{ sessionID, status: { type: "busy" | "idle" } }`
    case "session.status": {
      const status = p.status as { type?: string } | undefined;
      if (!status?.type || !sessionId) return [];
      return [{ kind: "status", sessionId, busy: status.type === "busy" }];
    }

    // The finished-turn signal. Carries only `{ sessionID }` — nothing else.
    case "session.idle":
      return sessionId ? [{ kind: "turn.finished", sessionId }] : [];

    // The complete assistant text arrives here, not as a fragment. `tool`, `reasoning`,
    // `step-start` and `step-finish` parts are silent.
    case "message.part.updated": {
      const part = p.part as { id?: string; type?: string; text?: string } | undefined;
      if (part?.type !== "text" || typeof part.text !== "string" || !sessionId) return [];
      return [
        { kind: "assistant.text", sessionId, partId: part.id ?? "", text: part.text },
      ];
    }

    // `{ file }` only — no session id. See the note in state.ts.
    case "file.edited": {
      const path = typeof p.file === "string" ? p.file : null;
      return path ? [{ kind: "file.edited", sessionId: null, path }] : [];
    }

    // `{ id, sessionID, permission, patterns, metadata, always, tool }`
    case "permission.asked": {
      const permissionId = typeof p.id === "string" ? p.id : "";
      const tool = typeof p.permission === "string" ? p.permission : "unknown";
      if (!permissionId || !sessionId) return [];
      const metadata = p.metadata as Record<string, unknown> | undefined;
      return [
        {
          kind: "permission.requested",
          sessionId,
          permissionId,
          tool,
          summary: `${describePermission(tool, metadata)} ${permissionOptions()}`.trim(),
          options: ["once", "always", "reject"],
        },
      ];
    }

    // `{ sessionID, requestID, reply }`
    case "permission.replied": {
      const permissionId = typeof p.requestID === "string" ? p.requestID : "";
      const reply = typeof p.reply === "string" ? p.reply : "";
      if (!permissionId || !sessionId) return [];
      return [{ kind: "permission.answered", sessionId, permissionId, reply }];
    }

    // A structured multiple-choice question. Distinct from a permission. Each option carries a
    // label AND a description, and the recommended one is marked — so nuncio can ask the way a
    // colleague would rather than reading a bare list.
    case "question.asked": {
      const questionId = typeof p.id === "string" ? p.id : "";
      const questions = p.questions as
        | { question?: string; options?: { label?: string; description?: string }[] }[]
        | undefined;
      const first = questions?.[0];
      if (!questionId || !sessionId || !first?.question) return [];

      const options: QuestionOption[] = (first.options ?? [])
        .map((o) => ({
          label: stripRecommended(o.label ?? ""),
          description: o.description,
          recommended: isRecommended(o.label ?? ""),
        }))
        .filter((o) => o.label !== "");

      return [
        {
          kind: "question.asked",
          sessionId,
          questionId,
          spoken: describeQuestion(first.question, options),
          options: options.map((o) => o.label),
        },
      ];
    }

    case "question.replied": {
      const questionId = typeof p.id === "string" ? p.id : "";
      if (!questionId || !sessionId) return [];
      return [{ kind: "question.answered", sessionId, questionId }];
    }

    // `{ sessionID, error: { name, data: { message } } }`
    case "session.error": {
      const error = p.error as { name?: string; data?: { message?: string } } | undefined;
      const name = error?.name ?? "Error";
      if (!sessionId) return [];
      return [
        {
          kind: "error",
          sessionId,
          name,
          message: error?.data?.message ?? name,
          // Pressing escape produces this. It is not a failure.
          userAborted: name === "MessageAbortedError",
        },
      ];
    }

    default:
      return [];
  }
}

/** Turn a permission request into something worth hearing. See describe.ts. */
function describePermission(tool: string, metadata: Record<string, unknown> | undefined): string {
  if (tool === "bash" && typeof metadata?.command === "string") {
    return describeBash(metadata.command);
  }
  if (tool === "edit" && typeof metadata?.filepath === "string") {
    return describeEdit(
      fileName(metadata.filepath),
      typeof metadata.diff === "string" ? metadata.diff : undefined,
    );
  }
  return `I need permission for ${tool}.`;
}

const RECOMMENDED = /\s*\((recommended|default)\)\s*$/i;

/** Option labels carry "(Recommended)". Spoken that is noise, but the fact is useful. */
function isRecommended(label: string): boolean {
  return RECOMMENDED.test(label);
}

function stripRecommended(label: string): string {
  return label.replace(RECOMMENDED, "").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
