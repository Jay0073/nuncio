# 02 — Capability Tracks

## Why this document exists

Earlier planning mixed four different kinds of thought into one list:

1. **Vision** — what the world looks like when this exists.
2. **Capability** — what the tool can do.
3. **Mechanism** — how a capability is built.
4. **Quality bar** — how good it should feel.

Only capabilities can be scheduled into a version. Mechanisms and quality bars cannot. That is
why choosing what to build first felt impossible.

The unlock:

> Most ideas here are not separate features. They are different maturity levels of the same
> few capabilities.

"Agent marks what to speak", "local model classifies text", and "fine-tuned model on my
labels" are not three features. They are levels 1, 4 and 5 of one capability: what reaches
your ears. You do not choose between them. You choose how far along that line you need to be
for a given version.

There are eight tracks. Every idea belongs to one of them, at one level.

---

## Track 1 — EAR: what reaches your ears

| Level | What it is |
|---|---|
| L0 | Nothing. You read the screen. |
| L1 | The agent marks its own highlights in a `<<SPEAK>>` block. The daemon strips the block from the visible output and speaks it verbatim. |
| L2 | The daemon reformats for the ear. Strip markdown. Shorten paths. Lists become natural speech. Code references become spoken form. |
| L3 | Ranking and a time budget. The agent emits ordered items with a priority. The daemon has a fixed speech budget, for example 20 seconds. It speaks down the list until the budget runs out, then says "there is more, want it?" |
| L4 | A local model classifies text the agent did not mark. |
| L5 | A fine-tuned model on collected labels. Adapts per project. |

### The `<<SPEAK>>` block

```
<<SPEAK>>
done:     Added JWT auth with refresh tokens. 4 files.
decision: Used httpOnly cookies instead of localStorage.
blocked:  Cannot reach the staging database.
ask:      Token expiry — I used 15 minutes. Keep it? [yes / change]
<<END>>
```

The daemon strips this block from the visible output and speaks it. Nothing else is spoken.

**Required fallback.** The agent may fail to emit the block. Free and smaller models follow
formatting instructions less reliably than frontier models. When the block is missing, the
daemon must fall back to a template built from event metadata, for example: "Finished. Four
files changed. No details given." Never speak the raw response as a fallback — that is the
dumb-narration failure mode this project exists to avoid.

---

## Track 2 — MOUTH: how you talk to it, and how mistakes get caught

| Level | What it is |
|---|---|
| L0 | You type in the CLI. Wispr Flow does the dictation. nuncio is not involved. |
| L1 | Push-to-talk in the browser page. Local Whisper. Text goes to `prompt_async`. |
| L2 | Typed fallback, paste, and image input. Not every input is speech. |
| L3 | Repo vocabulary bias. Feed function names, file names and library names from the repo to Whisper as a bias list, so it stops mishearing code terms. |
| L4 | Read-back confirmation for high-stakes prompts. |
| L5 | Open mic with voice activity detection. Then a wake word. |

**Why L3 and L4 matter more than they look.** Today the user reads the transcription before
pressing Enter. That is the correction loop. It disappears the moment he stops looking at the
screen. A misheard file name sends the agent off building the wrong thing, and he finds out
twenty minutes later. This failure gets worse the further he is from the laptop, which is
exactly when the product is most valuable. L3 reduces the error rate. L4 catches what is left.

---

## Track 3 — ATTENTION: when it pings, when it speaks

| Level | What it is |
|---|---|
| L0 | Silent. |
| L1 | Three distinct ping sounds: done, needs you, error. Pull only. |
| L2 | Full state machine. |
| L3 | Liveness heartbeat. A soft tick or a glanceable status while working. |
| L4 | Spoken ping with the user's name. "Hey Jay, it is done." |
| L5 | Do-not-disturb awareness. Suppress pings when the microphone is active in another app, or when the user is typing. |

### The state machine

The rule that matters: **the tool never speaks unless the user opened the channel.**

| State | What is happening | Does it speak? |
|---|---|---|
| IDLE | Nothing running | No |
| WORKING | Agent is running | No |
| PENDING | Something is waiting for the user | Ping only. Never speaks. |
| SPEAKING | The user opened the channel | Yes |
| LISTENING | The user is talking | No. Audio stopped. |

Transitions:

- prompt sent → WORKING
- `session.idle` → PENDING
- `permission.asked` → PENDING
- `session.error` → PENDING
- user opens the channel → SPEAKING
- user talks during SPEAKING → LISTENING

**Why L3 is not cosmetic.** A silent tool and a crashed tool sound exactly the same. Without a
liveness signal the user will keep checking the screen, which defeats the whole point.

---

## Track 4 — HANDOFF: where the session lives

| Level | What it is |
|---|---|
| L0 | Desk only. |
| L1 | A web page served on the LAN. The phone finds it over mDNS. |
| L2 | Explicit handoff. A "go mobile" switch that carries state and shows which device owns the channel. |
| L3 | Off-network. Tailscale or a relay. |
| L4 | Background audio, lock-screen controls, headphone button, car mode. |
| L5 | Earbud only. No screen at all. |

**This track is the differentiator.** Eight OpenCode voice plugins exist. All of them speak
the response when the session goes idle, and stop there. AgentsRoom does good two-way voice
but is desktop only. Every mobile client is screen-based and needs eyes. Nobody built the
handoff. It is a systems problem, not a machine-learning problem, and it is the piece every
competitor skipped.

---

## Track 5 — TURN-TAKING: interruption and permissions

| Level | What it is |
|---|---|
| L0 | None. |
| L1 | Push-to-talk cancels the audio. This gives barge-in for free — no voice detection, no echo cancellation, no false triggers. |
| L2 | Answer a permission while it is still reading the options. The user says "option one". |
| L3 | Risk-tiered spoken permissions. |
| L4 | Queue by default. "Stop, do it this way instead" triggers abort-and-merge. Explicit, so the user always knows which one happened. |
| L5 | True mid-turn steering. **Blocked by OpenCode.** |

### Three kinds of interruption

| Kind | Situation | Difficulty | Verdict |
|---|---|---|---|
| Interrupt the speaker | The tool is reading a question or a report. The agent is idle. The user cuts in. | Easy | Build it. This is the actual scenario. |
| Interrupt the worker | The agent is mid-turn writing code. The user adds an instruction. | Blocked by OpenCode | Queue it, or abort and merge |
| Interrupt to redirect | The tool is reading a finished report. The user says "also add X". | Easy | Falls out of the first for free |

Mid-turn steering does not exist in OpenCode. Messages sent during a running turn are queued
and delivered after the turn ends. See `docs/06-research.md` for the issue numbers. Do not plan
around it.

### Risk tiers for L3

| Tier | Example |
|---|---|
| read-only | reads a file inside the repo |
| writes in repo | edits or creates a file inside the repo |
| writes outside repo | touches anything above the project root |
| network | any outbound request, install, or push |
| destructive | delete, force, reset, drop, overwrite |

Spoken form: "It wants to run a command that deletes files in the build folder. That is
destructive. Allow once, allow for this session, or deny."

---

## Track 6 — RECALL: memory

| Level | What it is |
|---|---|
| L0 | Everything goes to the agent. |
| L1 | Instrumentation only. Log every utterance and how long the agent took to answer it. |
| L2 | Replay buffer. Everything spoken is kept as audio plus text. "Repeat that", "slower", "what did you say about the tokens" all answer from the buffer. No model. No agent call. |
| L3 | Transcript-backed instant answers for a small closed set: what files changed, did the tests pass. |
| L4 | General transcript question answering with cascade routing. |
| L5 | Cross-session memory. Voice bookmarks feeding a review list. |

### The three paths, resolved

Earlier planning treated routing as the make-or-break unsolved problem. It is not one problem.
It is three problems with very different cost and risk.

- **Path C** — about the last spoken output ("repeat that"). Build early. A small closed set of
  keywords operating on nuncio's own buffer. No model, no transcript, no agent call. This is
  Track 6 L2.
- **Path A** — a new task. The default. Everything unmatched goes here. Zero routing risk by
  construction.
- **Path B** — a question about what already happened. Do not build it early. Instrument it
  (L1) and decide later with data.

**Two corrections to earlier reasoning.** First, Path B was justified by context preservation.
That does not hold: what fills an agent's context is tool output volume, not conversation
turns. The real reason to build Path B is **latency** — fifteen seconds of silence is
unbearable in a spoken conversation. That changes the engineering target to time-to-first-word,
which means caching, not token saving.

Second, the risk asymmetry was inverted. Misrouting B to A is cheap. **A to B is the dangerous
one:** the user says "add rate limiting to the login endpoint", the router treats it as a
question about history, and the user walks away believing work is underway when it is not.
**Default to the agent on any uncertainty.**

---

## Track 7 — PERSONA: how the agent behaves and who it sounds like

| Level | What it is |
|---|---|
| L0 | Default agent. |
| L1 | Injected intern persona plus the `<<SPEAK>>` block contract. |
| L2 | Binary decision contract. When a decision is binary, the agent must ask it as one line with a stated default, so it is answerable in one word. |
| L3 | The persona changes with the mode. Terser on the phone than at the desk. |
| L4 | Named identity and a fixed voice. Two voices — one for the agent's words, one for nuncio's own words, so the user always knows who is speaking. |
| L5 | Multiple agents with distinct voices. |

**Persona and speak-layer must be co-designed.** What the persona tells the agent to do is what
makes the speak-layer's job easy. This is also the answer to the moat problem: **you control
the tap.** Do not build a sophisticated filter for a firehose you can turn down at the source.

---

## Track 8 — REACH: which CLIs, which surfaces

| Level | What it is |
|---|---|
| L0 | OpenCode only, one session. |
| L1 | OpenCode via the server API. |
| L2 | Multiple concurrent OpenCode sessions. |
| L3 | Claude Code adapter. Normalised event schema. |
| L4 | Codex, Gemini CLI. |
| L5 | Slack, WhatsApp, phone call, hardware. |

Do not build the abstraction layer until the second adapter is actually needed. Premature
abstraction here is a trap.
