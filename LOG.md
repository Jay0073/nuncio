# Change Log

Newest entry first. Append-only — never edit or delete an old entry. If an entry was wrong,
add a new one that corrects it.

Format is defined in [AGENTS.md](AGENTS.md), Rule 1.

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
