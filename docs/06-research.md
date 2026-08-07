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

### SDK method names

From `opencode.ai/docs/sdk`, August 2026. These are what the code actually calls.

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })

// events
const events = await client.event.subscribe()
for await (const event of events.stream) { /* event.type, event.properties */ }

// sessions
await client.session.create({ body: { title: "..." } })
await client.session.list()
await client.session.get({ path: { id } })
await client.session.messages({ path: { id } })
await client.session.abort({ path: { id } })

// prompting
await client.session.prompt({
  path: { id },
  body: {
    model: { providerID: "...", modelID: "..." },   // omit to use the server default
    parts: [{ type: "text", text: "..." }],
  },
})
// body.noReply = true sends context without asking for a reply

// permissions
await client.postSessionByIdPermissionsByPermissionId({
  path: { id, permissionId },
  body: { allow: true },
})
```

**Discrepancy to resolve before v2.** The REST documentation describes the permission body as
`{ response, remember? }`. The SDK documentation shows `{ allow: true }`. These do not match.
One of them is out of date. The v0 event capture will show what a real `permission` event
carries, and that decides which is right. Do not write the v2 permission loop until this is
settled.

### Verified locally, 7 August 2026

- `opencode` CLI version **1.18.3**, installed at `AppData\Roaming\npm\opencode.ps1`.
- `@opencode-ai/sdk` resolved to **1.18.15**. The SDK is slightly ahead of the CLI. No problem
  seen yet, but if something behaves strangely, check this first.
- `opencode serve --port 4096` starts and listens.
- `client.event.subscribe()` works. The listener connected and captured real events.
- **`server.connected` fires on connect. `server.heartbeat` fires every 10 seconds.**
  That heartbeat is a free liveness signal — it can drive Track ATTENTION L3 with no extra
  work, and it tells nuncio immediately when the server has gone away.

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

**Default model:** "Big Pickle", the owner's default inside OpenCode. Not published directly by
a provider. Widely believed to be a Claude Sonnet class model, and it performs well on the
owner's real coding sessions. See decision D-015.

### Model test results

Fill this in by running `bun run model-test`. It prints the table ready to paste. Record the
exact model identifier as OpenCode reports it, not a remembered display name.

| Model ID (as OpenCode reports it) | Block emitted correctly | Notes |
|---|---|---|
| | | |

**How to read the result.** The requirement here is not intelligence. It is consistency at
following an output format. A smaller model that emits the block every time is better for
nuncio than a smarter model that forgets it half the time.

- 10 / 10 — build v1 on this model.
- 7 to 9 / 10 — usable, but the fallback (D-013) will fire often. Check whether the fallback
  report is good enough on its own.
- Below 7 / 10 — the block contract is not viable on this model. Contingency: have the daemon
  make one separate cheap call to a small model purely to produce the block. That costs
  latency and a second model, so treat it as a fallback, not the plan.
