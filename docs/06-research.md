# 06 — Research and Confirmed Facts

Everything here was checked against a source. Where something is inherited from an earlier
session and not re-verified, it says so.

---

## OpenCode server API

Confirmed from `opencode.ai/docs/server` and `opencode.ai/docs/sdk` in August 2026.

| Purpose | Endpoint |
|---|---|
| Event stream | `GET /event` — server-sent events |
| Create session | `POST /session` |
| Prompt, non-blocking | `POST /session/:id/prompt_async` → 204 |
| Prompt, blocking | `POST /session/:id/message` |
| Stop a turn | `POST /session/:id/abort` |
| Answer a permission | `POST /session/:id/permissions/:permissionID` — body `{ response, remember? }` |
| Read history | `GET /session/:id/message` |
| OpenAPI spec | `/doc` — OpenAPI 3.1 |

**Official SDK:** `@opencode-ai/sdk`, generated from the OpenAPI spec, fully typed, supports
SSE streaming. `createOpencodeClient({ baseUrl })` connects to an already-running server, which
is exactly the daemon design. A second package, `@opencode-ai/plugin`, exists for authoring
plugins — not needed here.

**Phone transport:** `opencode web --mdns` binds to `0.0.0.0` and advertises the machine as
`opencode.local` on the local network. Also `--mdns-domain` and `--cors`.

---

## Known OpenCode limits and bugs

| Issue | What it means for nuncio |
|---|---|
| #32157, #16102 | Mid-turn steering requested, both open, neither built. Messages sent during a running turn are queued and delivered after it ends. |
| #28375 | Queued prompts can start before the active response finishes. Ordering bug. Test queuing before relying on it. |
| #29894 | `session.abort` from inside a plugin does nothing in server mode. Abort must use the HTTP endpoint. This is one reason for D-002. |
| #4695 | The most-supported native voice request was closed "not planned" on 4 June 2026. Good news: OpenCode will not build this itself. |

**Note:** these issue numbers were gathered in a prior session and have not been re-verified.
Confirm during v0 before depending on any of them.

---

## Competitive landscape

Gathered in a prior session, early August 2026. Not re-verified.

**OpenCode voice plugins — eight of them.** The most developed is `renjfk/opencode-voice`
(about 45 stars): local whisper-cpp for STT, Piper for TTS, and an LLM that decides whether to
narrate, summarise or briefly notify. It triggers on session idle, permission requests, and
questions. `StefanoChiodino/opencode-tts` summarises on idle (about 2 stars). Also
`MasuRii/opencode-smart-voice-notify`, `Olbrasoft/opencode-voice-plugin`,
`anomalyco/opencode-voice`, `superultrainc/opencode-superwhisper`, plus two STT-only plugins.

**All eight do the same thing:** speak the response when the session goes idle. None of them
handle the handoff.

**AgentsRoom Voice Mode** — commercial, bidirectional, works across many CLIs, does voice
approvals, exposes explicit conversation states. Desktop only, macOS. Its own documentation
says the mobile app does monitoring, not Voice Mode.

**Mobile clients** — `dzianisv/opencode-mobile`, `harness-remote`, Pocket for OpenCode,
OpenLens on iOS, MobileCLI. Every one is screen-based. Not one is voice-first.

**The gap:** nobody built the handoff — "the session follows me from the desk to my pocket, and
the interface changes from screen to voice when it does."

**The unresolved signal:** traction across all of them is low. Two readings. Either nobody
executed well, or demand is thin. This is not settled. The cheapest way to settle it is to
install `renjfk/opencode-voice` and use it for a week.

---

## Performance benchmarks

Inherited, not measured on this machine.

| Engine | Time to first audio | Note |
|---|---|---|
| Piper | ~40ms on Apple Silicon, ~1510ms on CPU | The CPU figure is the risk. Must be measured here. |
| Kokoro | ~28ms on GPU | 341MB model, 1.9GB RAM. **Not usable on this machine — no NVIDIA GPU.** |

**Development machine:** Intel Core i5-12500H, 12 cores / 16 threads, 19.7 GB RAM, Intel Iris
Xe integrated graphics, Windows 11. No CUDA.

This is why v1 uses the browser's built-in speech synthesis and installs no TTS engine at all.
Intel OpenVINO is a possible acceleration path for whisper.cpp on the Iris Xe if CPU inference
turns out too slow in v2. Not investigated yet.

---

## Browser constraints

- iOS Safari blocks audio autoplay without a user gesture. The talk button is the gesture,
  which works in nuncio's favour, but test on the real device early.
- A browser tab cannot receive a global hotkey while unfocused. Accepted cost of D-012.
- Android is the test device for v3.

---

## Model availability

The development account has free-tier models only. Frontier models (Claude, GPT, Gemini) are
behind a paywall and are not available.

**This is an open risk, not a settled fact.** The `<<SPEAK>>` block contract depends on the
model reliably following a formatting instruction on every turn. Smaller and free models do
this less consistently than frontier models. Two consequences:

1. The fallback path (D-013) is not optional. It will be used.
2. v0 must include a model test: send the persona to each available model and check whether the
   block appears, correctly formatted, ten times out of ten. Record the results in the table
   below.

### Model test results

Fill this in during v0. Record the exact model identifier as OpenCode reports it, not a
remembered name.

| Model ID (as OpenCode reports it) | Block emitted correctly | Notes |
|---|---|---|
| | | |
