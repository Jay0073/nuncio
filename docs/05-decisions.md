# 05 — Decision Log

Append-only. When a decision is reversed, mark the old one **SUPERSEDED** and link to the new
one. Do not edit old text.

---

## Active decisions

### D-001 — Target OpenCode only
**Status:** active
Claude Code runs on an organisation subscription, so it is not freely available for
development. OpenCode also closed its native voice request as "not planned", so the plugin and
API ecosystem is the only path voice can take there. Claude Code support is Track REACH L3, in
v6.

### D-002 — Daemon, not plugin
**Status:** active
See [04-architecture.md](04-architecture.md). Four reasons: the phone needs an HTTP host,
`session.abort` is broken inside plugins in server mode, audio from a plugin is awkward, and
the server event stream is sufficient.

### D-003 — Pull notification model
**Status:** active
nuncio never speaks unless the user opened the channel. It plays a soft ping and waits. This
matches how the CLI already behaves and how IDE extensions notify. It also removes the entire
class of "the tool interrupted me at a bad moment" failures.

### D-004 — Phone is same-network only in v1 through v5
**Status:** active
WiFi and mDNS. No Tailscale, no relay. The focus is the tool's behaviour, not the transport.
Off-network is Track HANDOFF L3, in v6.

### D-005 — Wispr Flow is not a dependency
**Status:** active
Its API is gated behind enterprise approval. It also types into the focused text field, so it
cannot hand nuncio the text before the CLI sees it. It stays as the user's separate typing
tool, untouched. nuncio builds its own capture with local Whisper from v2.

### D-006 — The agent marks what to speak; no classifier in early versions
**Status:** active
The persona instructs the agent to emit a `<<SPEAK>>` block. The daemon speaks only that. No
model, no latency, no fine-tuning, no hallucination, and it is deterministic.
The reasoning: **you control the tap.** Do not build a sophisticated filter for a firehose you
can turn down at the source. A classifier is Track EAR L4, in v5, and only if the logs say it
is needed.

### D-007 — Path B is deferred and instrumented, not built
**Status:** active
Log every utterance and how long the agent takes to answer it. Decide with data in v5. Path C
is cheap and is built in v2. Path A is the default for everything unmatched.
**Default to the agent on any uncertainty** — misrouting a new task to the transcript is the
dangerous direction, because the user walks away believing work is underway when it is not.

### D-008 — Push-to-talk, not open mic, in early versions
**Status:** active
Push-to-talk gives barge-in for free: press the button, audio stops. No voice detection, no
echo cancellation, no false triggers from background noise. Open mic with VAD is Track MOUTH
L5, in v5.

### D-009 — Do not plan around mid-turn steering
**Status:** active
OpenCode queues messages sent during a running turn. Issues #32157 and #16102 request steering.
Both are open and unbuilt. Queue is the default. Abort-and-merge is an explicit spoken command
so the user always knows which one happened.

### D-010 — Repository is private
**Status:** active
The v1 kill criterion is real, and it is easier to stop something that is not public. Revisit
after v1 passes.

### D-011 — TypeScript on Bun
**Status:** active
OpenCode publishes an official TypeScript SDK, `@opencode-ai/sdk`, generated from its own
OpenAPI spec, with SSE handling built in. The phone client is a web page and is TypeScript
regardless. Python, Go or Rust would each mean maintaining a generated client and working in
two languages for one small tool. Go remains worth reconsidering at v6, when single-binary
distribution starts to matter. Node is an acceptable fallback if Bun causes trouble on Windows.

### D-012 — Audio lives in the browser, never in the daemon
**Status:** active
The daemon serves a web page and that page does all audio capture and playback. The
development machine is Windows with no NVIDIA GPU, and native audio bindings from Node or Bun
on Windows are the most fragile part of this project. This removes that problem, makes v3
nearly free, and lets v1 ship with no TTS engine by using the browser's built-in speech
synthesis.
Known cost: a browser tab cannot receive a global hotkey while unfocused. Accepted for v1.

### D-013 — The `<<SPEAK>>` block must have a fallback
**Status:** active
The available models are free-tier models with unknown instruction-following reliability. When
the block is missing, the daemon falls back to a template built from event metadata. It must
**never** fall back to speaking the raw response — that is the dumb-narration failure mode this
project exists to avoid.

### D-014 — Name: nuncio
**Status:** active
Latin *nuntius*, the messenger who carries word between two parties. The npm name is free and
there is no clash in the agent or developer-tool space. Provisional — the owner may change it
later.

### D-015 — Develop against OpenCode's default model
**Status:** active
The owner's default in OpenCode is a model shown as "Big Pickle". It is not a model published
directly by a provider — it is offered inside OpenCode and is widely believed to be a Claude
Sonnet class model. It performs well on the owner's real coding sessions, which is the thing
that matters most, since nuncio must not make the coding worse.

Practical consequence: the v0 model test sends **no** `model` field, so the server uses its
configured default. That keeps the test honest — it measures the model actually used for work,
not a model chosen for the test.

Revisit only if the v0 numbers show the block is emitted unreliably. Paid or higher models are
a fallback, decided by measurement, not by preference.

### D-016 — Test the block contract, not the persona, in v0
**Status:** active
`src/persona.ts` contains only the `<<SPEAK>>` block contract. The behavioural half of the
intern persona (lead with outcomes, do not narrate steps) is Track PERSONA L1 and belongs in
v1. Keeping them apart means the v0 measurement answers one question: can this model follow
the format reliably. Mixing them in would measure two things at once.

---

## Superseded decisions

These were decided in the July 2026 planning documents and no longer hold. They are kept so
that nobody re-derives them.

### S-001 — Build as an OpenCode plugin
**Superseded by D-002.** A plugin cannot host the phone server, and `session.abort` is broken
inside plugins in server mode.

### S-002 — Use Wispr Flow as the STT component
**Superseded by D-005.** Its API is enterprise-gated, and it types into the focused field, so
it cannot give nuncio the text before the CLI sees it.

### S-003 — Voicebox as a dependency
**Superseded by D-012.** Voicebox is a full GUI application. Too heavy. Add later only if voice
cloning becomes desirable.

### S-004 — Model-first, no heuristics, from day one
**Superseded by D-006.** The agent marks its own highlights instead.

### S-005 — A fine-tuned tiny model is the moat
**Superseded.** Not defensible. One person's preference labels do not generalise, and 500 to
1000 examples is a weekend of work for a competitor. The better candidate is the handoff
(Track HANDOFF), or publishing the `<<SPEAK>>` block as an open contract that other tools can
adopt.

### S-006 — Path B is justified by context preservation
**Superseded by D-007.** What fills an agent's context is tool output volume, not conversation
turns. The real justification is latency.

### S-007 — Misrouting B to A is the harmful direction
**Inverted, see D-007.** A to B is the dangerous one.

### S-008 — Phone deferred to Phase 3 and beyond
**Superseded.** The phone is v3. It is the differentiator, not an extra.

### S-009 — Intent routing is an unsolved research problem
**Superseded by D-007.** It is three separate problems with different cost and risk. Cascade
routing is a known engineering pattern, not open research.

### S-010 — "Eyes-free development" as the framing
**Superseded.** Use "stay in the loop without being tied to the screen". See
[01-vision.md](01-vision.md).

### S-011 — The twelve-week phased plan
**Superseded by [03-versions.md](03-versions.md).**
