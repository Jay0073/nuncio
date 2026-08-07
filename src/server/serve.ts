/**
 * The local web server.
 *
 * nuncio serves its own page. It does not depend on any CLI's own web UI, because Claude Code
 * has none. See D-018.
 *
 * The page is the audio device. The daemon never opens a microphone or a speaker — see D-012.
 * At the desk the page is opened on localhost. In v3 the same page is opened over the LAN from
 * a phone. That is why the handoff is cheap.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NuncioState, UiEvent } from "../core/state.ts";

const PAGE = join(process.cwd(), "src", "web", "index.html");

export interface ServerOptions {
  port: number;
  /** Bind address. "127.0.0.1" at the desk; "0.0.0.0" for the LAN in v3. */
  hostname: string;
  getState: () => NuncioState;
  onUiEvent: (event: UiEvent) => void;
}

export function startServer(options: ServerOptions) {
  const sockets = new Set<{ send: (data: string) => void }>();

  const server = Bun.serve({
    port: options.port,
    hostname: options.hostname,

    fetch(request, srv) {
      const url = new URL(request.url);

      if (url.pathname === "/ws") {
        return srv.upgrade(request) ? undefined : new Response("upgrade failed", { status: 400 });
      }

      if (url.pathname === "/state") {
        return Response.json(options.getState());
      }

      // Read from disk on every request so the page can be edited without a restart.
      try {
        return new Response(readFileSync(PAGE, "utf8"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch {
        return new Response("src/web/index.html not found. Run nuncio from the project root.", {
          status: 500,
        });
      }
    },

    websocket: {
      open(ws) {
        sockets.add(ws);
        ws.send(JSON.stringify(options.getState()));
      },
      close(ws) {
        sockets.delete(ws);
      },
      message(_ws, raw) {
        try {
          const parsed = JSON.parse(String(raw)) as UiEvent;
          if (parsed.kind === "ui.open" || parsed.kind === "ui.done") {
            options.onUiEvent(parsed);
          }
        } catch {
          // A malformed frame from the page is not worth crashing the daemon over.
        }
      },
    },
  });

  return {
    url: `http://${options.hostname === "0.0.0.0" ? "localhost" : options.hostname}:${server.port}`,
    /** Push the current state to every connected page. */
    broadcast(state: NuncioState) {
      const payload = JSON.stringify(state);
      for (const socket of sockets) {
        try {
          socket.send(payload);
        } catch {
          sockets.delete(socket);
        }
      }
    },
    stop() {
      server.stop(true);
    },
  };
}
