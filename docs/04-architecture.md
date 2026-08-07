# 04 — Architecture

## Daemon, not plugin

nuncio is a separate local process. It is **not** an OpenCode plugin.

Four reasons:

1. A plugin lives inside the OpenCode process. The phone needs something to talk to, and a
   plugin is a bad host for an HTTP server.
2. `session.abort` called from inside a plugin silently does nothing when OpenCode runs in
   server mode (issue #29894). Abort must go through the HTTP endpoint.
3. Audio capture and playback from inside a plugin is awkward.
4. It is not needed. The server event stream gives everything the plugin event hook gives.

So: run OpenCode in server mode. nuncio talks to it over HTTP and SSE.

```
   ┌──────────────────────────────────────────────┐
   │  nuncio daemon  (Bun + TypeScript)           │
   │                                              │
   │  SSE client  ◄──── GET /event                │
   │  HTTP client ────► prompt / abort / permit   │
   │                                              │
   │  ┌────────────┐  ┌───────────┐  ┌─────────┐  │
   │  │   State    │  │   Speak   │  │  STT    │  │
   │  │  Machine   │  │   Layer   │  │ (v2+)   │  │
   │  └────────────┘  └───────────┘  └─────────┘  │
   │                                              │
   │  web server + WebSocket ──► browser page     │
   └──────────────────────┬───────────────────────┘
                          │ HTTP + SSE
                   ┌──────▼──────┐
                   │  opencode   │
                   │   serve     │
                   └─────────────┘

   browser page  =  the audio device
      desk  → opened on localhost
      phone → opened over the LAN (v3)
```

Everything runs on the laptop. The phone is a microphone, a speaker, and a screen.

---

## Audio lives in the browser

**The daemon never opens a microphone and never opens a speaker.** It serves a small web page.
That page captures audio and plays audio. At the desk the page is opened on `localhost`. On the
phone the same page is opened over the LAN.

Three reasons:

1. **Native audio on Windows from Node or Bun is the hardest part of this project.** The
   bindings are difficult to build and break often. This removes the problem completely.
2. **v3 becomes nearly free.** The handoff is no longer a new feature. It is the same page
   opened on a different device.
3. **v1 needs no TTS engine.** Browsers have built-in speech synthesis. Chrome on Windows,
   Chrome on Android and Safari on iOS all have usable voices. Zero install, zero model.

**The cost, stated honestly.** A browser tab cannot receive a global hotkey while it is
unfocused. In v1 the ping sound gets attention and the user clicks in the tab to hear the
report. If that becomes annoying, a small tray helper or a Tauri shell fixes it later. It is
not worth solving in v1.

**Keep TTS behind an interface.** `speak(text)` should be one small module. Swapping the
browser engine for Piper or Kokoro later must be a one-file change.

---

## Stack

| Part | Choice | Note |
|---|---|---|
| Language | TypeScript | |
| Runtime | Bun | Node is an acceptable fallback if Bun causes trouble on Windows |
| OpenCode client | `@opencode-ai/sdk` | Official, generated from OpenCode's OpenAPI spec, handles SSE. Do not hand-write it. |
| TTS (v1) | Browser `speechSynthesis` | No install |
| TTS (later) | Piper, or Kokoro | Measure on this CPU first. No NVIDIA GPU on this machine. |
| STT (v2+) | whisper.cpp | Runs as a separate process |
| VAD (v5) | Silero via ONNX in the browser | Browser-side, so the daemon stays audio-free |

**Why TypeScript and not Python, Go or Rust.** OpenCode publishes an official TypeScript SDK
generated from its own OpenAPI spec, with SSE handling built in. The phone client is a web page
and is TypeScript regardless. Any other language means maintaining a generated client and
working in two languages for one small tool. The heavy pieces — Whisper, the TTS engine — run
as separate processes and do not care what language calls them, so the escape hatch stays open.

---

## OpenCode API surface

All confirmed. See [06-research.md](06-research.md) for how.

| What is needed | Endpoint |
|---|---|
| Watch everything happen | `GET /event` — server-sent events |
| Create a session | `POST /session` |
| Send a prompt, do not block | `POST /session/:id/prompt_async` → 204 |
| Send a prompt, get the reply | `POST /session/:id/message` |
| Stop a running turn | `POST /session/:id/abort` |
| Answer a permission | `POST /session/:id/permissions/:permissionID` — body `{ response, remember? }` |
| Read history | `GET /session/:id/message` |
| Client generation | OpenAPI 3.1 spec at `/doc` |

Phone transport in v3: `opencode web --mdns` binds to `0.0.0.0` and advertises the machine as
`opencode.local` on the local network. Also `--mdns-domain` and `--cors`.

---

## The adapter boundary — define it now, implement one

nuncio will eventually run against OpenCode, Claude Code, and Antigravity. Only the OpenCode
adapter gets built for a long time, but the boundary is defined from v1.

This reverses the old advice ("do not abstract until the second adapter is needed"). That
advice is right when the second case is imagined. Here it is known. A six-event interface costs
an hour now. Retrofitting one costs a rewrite.

### The interface must be push-based, not pull-based

This is the decision that matters, and it is easy to get wrong.

| CLI | How nuncio learns things |
|---|---|
| OpenCode | nuncio **pulls** — it subscribes to `GET /event` and reads an SSE stream |
| Claude Code | Claude Code **pushes** — it runs a hook command at lifecycle moments and passes JSON on stdin |
| Antigravity | not yet checked |

If the core is written around "subscribe to a stream", Claude Code does not fit and the core
has to be rewritten. If the core is written around "adapters emit events into nuncio", both
fit:

- The OpenCode adapter runs an SSE loop and emits.
- The Claude Code adapter runs a tiny local HTTP endpoint that its hook scripts post to, and
  emits.

So: **adapters push into nuncio. nuncio never pulls from an adapter.**

### The normalised event set

Six kinds. Add a kind only when a version needs it.

```ts
type NormalizedEvent =
  | { kind: "status";              sessionId: string; busy: boolean }
  | { kind: "turn.finished";       sessionId: string; text: string }
  | { kind: "permission.requested"; sessionId: string; permissionId: string;
                                    title: string; options: string[]; risk?: RiskTier }
  | { kind: "error";               sessionId: string; message: string }
  | { kind: "diff";                sessionId: string; files: FileChange[] }
  | { kind: "session.created";     sessionId: string; title?: string }
```

```ts
interface AgentAdapter {
  readonly name: string
  readonly capabilities: AgentCapabilities
  start(emit: (event: NormalizedEvent) => void): Promise<void>
  stop(): Promise<void>
  sendPrompt(sessionId: string, text: string): Promise<void>
  abort(sessionId: string): Promise<void>
  answerPermission(sessionId: string, permissionId: string, answer: string): Promise<void>
  installPersona(persona: string): Promise<void>   // may be a no-op
}
```

### Capabilities, not lowest common denominator

CLIs differ. Some cannot abort. Some cannot answer a permission programmatically. Do not design
for the weakest one — let each adapter declare what it can do and degrade honestly.

```ts
interface AgentCapabilities {
  sendPrompt: boolean
  abort: boolean
  answerPermission: boolean
  installPersona: boolean
  diffs: boolean
}
```

If `answerPermission` is false, nuncio still pings and still speaks the question. It just says
"answer it at the keyboard" instead of accepting a spoken answer. That is a smaller feature, not
a broken one.

### Why the `<<SPEAK>>` block makes this cheap

This is the part worth noticing. Because the **agent** produces the block, and every CLI runs a
model that produces text, the speak-layer is already CLI-agnostic. The only per-CLI work is:

1. get the assistant's final text for a turn
2. know when a turn ended

That is a tiny surface. Compare it with the design we rejected in D-006: classifying the raw
event stream with a local model would have needed a separate routing table for every CLI's
event taxonomy, and those taxonomies have nothing in common. D-006 was a good decision for its
own reasons. Multi-CLI support makes it a much better one.

### nuncio serves its own page

An earlier note said v3 could lean on OpenCode's web UI as the screen client. **That is wrong as
a general design.** Claude Code has no web UI. nuncio serves its own minimal page: talk button,
playback, ping, transcript. When the OpenCode adapter is active it may link out to OpenCode's UI
as a convenience, but it must never depend on it.

## Module boundaries

Keep these separate. Each should be understandable and testable on its own.

| Module | Responsibility | Depends on |
|---|---|---|
| `opencode-client` | Talk to OpenCode. Nothing else. | `@opencode-ai/sdk` |
| `events` | Turn the SSE stream into typed internal events | `opencode-client` |
| `state` | The five-state machine. Pure logic, no I/O. | `events` |
| `speak-layer` | Extract the `<<SPEAK>>` block, apply the fallback, produce text to speak | `events` |
| `persona` | The injected instructions and the block contract | nothing |
| `server` | Serve the page, WebSocket to the browser | `state`, `speak-layer` |
| `web` | The browser page. All audio. | `server` over WebSocket |

`state` must stay pure. If it does I/O, testing the conversation flow becomes hard, and the
conversation flow is the part most likely to need repeated tuning.

---

## Constraint that overrides everything

**nuncio must never degrade OpenCode's performance.** Developers will trade away user
experience before they trade away output quality.

How the architecture honours this:

- The speak-layer and the state machine run entirely outside the agent's context. They read the
  event stream. They never add prompts.
- Persona injection is small and happens once per session.
- nuncio is additive. The agent does not know it exists.
