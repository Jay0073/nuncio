# Change Log

Newest entry first. Append-only — never edit or delete an old entry. If an entry was wrong,
add a new one that corrects it.

Format is defined in [AGENTS.md](AGENTS.md), Rule 1.

---

## 2026-08-07 — v0 built: event listener, analyzer, model test

**Version:** v0
**Type:** feature
**Changed:** Added `package.json`, `tsconfig.json`, and:
- `src/config.ts` — base URL and paths
- `src/persona.ts` — the `<<SPEAK>>` block contract, its parser, `stripSpeakBlock`, and
  `renderForSpeech`
- `src/persona.test.ts` — 12 unit tests for the parser
- `src/v0/log-events.ts` — connects to `GET /event` and writes every event to
  `events/events-<date>.jsonl`, with reconnect and a Ctrl+C summary
- `src/v0/analyze.ts` — counts event types and dumps full payloads for the events v1 and v2
  depend on
- `src/v0/model-test.ts` — runs the block contract against a model N times and prints a
  markdown table of the results

Dependencies: `@opencode-ai/sdk` 1.18.15. Runtime: Bun 1.3.14.

**Why:** v0 exists to replace guesses with measurements. The event shapes and the model's
formatting reliability decide the whole v1 and v2 design, and both were unknown.

**Result:** Verified end to end. `bun test` — 12 pass, 0 fail. `bun run typecheck` — clean.
Started `opencode serve --port 4096`, ran the listener, and it connected and captured real
events. `bun run analyze` read them back correctly. The error path was checked too: analyze
exits with a clear message when there is no capture yet.

**Findings recorded in docs/06-research.md:**
- `server.connected` fires on connect; `server.heartbeat` fires every 10 seconds. That
  heartbeat is a free liveness signal for Track ATTENTION L3.
- `opencode` CLI is 1.18.3 while the SDK resolved to 1.18.15. Small version drift, no problem
  seen, but check it first if something behaves oddly.
- The REST docs and the SDK docs disagree on the permission request body: `{ response,
  remember? }` versus `{ allow: true }`. Unresolved. The v0 capture will settle it. Do not
  write the v2 permission loop until it is settled.

**Still to do by the owner:** run `bun run listen` for a full working day, then `bun run
analyze`, then `bun run model-test`.

---

## 2026-08-07 — Model decision: develop against OpenCode's default

**Version:** v0
**Type:** decision
**Changed:** Recorded D-015 and D-016 in `docs/05-decisions.md`. The v0 model test sends no
`model` field, so the server uses its configured default ("Big Pickle").

**Why:** The default is what the owner actually codes with, and nuncio must not make the
coding worse. Testing the model in real use is more honest than testing a model picked for the
test. D-016 keeps the behavioural persona out of v0 so the measurement answers one question
only: can this model follow the block format.

**Result:** Not yet tested. The results table in `docs/06-research.md` is waiting for numbers,
with thresholds written down in advance so the decision is not made after seeing the result.

---

## 2026-08-07 — GitHub repository created

**Version:** v0
**Type:** setup
**Changed:** Created the private repository `Jay0073/nuncio` and pushed `main`.

**Why:** Decision D-010 — private until v1 passes its kill criterion.

**Result:** Pushed. Remote is `https://github.com/Jay0073/nuncio.git`.

---

## 2026-08-07 — Project created, documentation set up

**Version:** v0
**Type:** setup
**Changed:** Created the repository at `C:\Users\jay\Documents\projects\nuncio`. Initialised
git on branch `main`. Wrote the full documentation set: `AGENTS.md` (entry point and working
rules), `README.md`, `LOG.md`, and `docs/01` through `docs/07` covering vision, capability
tracks, versions, architecture, decisions, research, and open questions. No code yet.

**Why:** Four planning sessions produced a large idea space that could not be ordered. The
eight capability tracks and the version grid are the mechanism for holding scope without
losing ideas. Writing them down before any code means future sessions start with full context
instead of re-deriving it.

**Result:** Documentation complete. Next step is v0 — the event Listening Post.

---

## 2026-08-07 — Stack chosen: TypeScript on Bun

**Version:** v0
**Type:** decision
**Changed:** Language and runtime fixed to TypeScript on Bun. Recorded as decision D-011 in
`docs/05-decisions.md`.

**Why:** OpenCode publishes an official TypeScript SDK, `@opencode-ai/sdk`, generated from its
own OpenAPI spec, with SSE handling built in. The phone client in v3 is a web page and is
TypeScript regardless. Choosing Python, Go or Rust would mean maintaining a generated client
and working in two languages for one small tool.

**Result:** Not yet tested. Bun is not installed on the development machine.

---

## 2026-08-07 — Audio moved to the browser

**Version:** v0
**Type:** decision
**Changed:** The daemon will never open a microphone or a speaker. It serves a small web page,
and that page handles all audio capture and playback. At the desk the page is opened on
localhost. On the phone the same page is opened over the LAN. Recorded as decision D-012.

**Why:** The development machine is Windows with no NVIDIA GPU. Native audio bindings from
Node or Bun on Windows are the hardest and most fragile part of this project. Moving audio to
the browser removes that problem completely. It also makes v3 nearly free, because the handoff
becomes the same page opened on a different device, and it lets v1 ship with no TTS engine at
all by using the browser's built-in speech synthesis.

**Result:** Not yet tested. Known cost: a browser tab cannot receive a global hotkey while
unfocused, so in v1 the ping gets attention and the user clicks in the tab.
