# 03 — Versions

A version is a horizontal cut across the eight capability tracks in
[02-tracks.md](02-tracks.md). Each version answers **one question** and has **one kill
criterion**.

## The grid

| Track | v1 Report | v2 Unblock | v3 Handoff | v4 Colleague | v5 Memory | v6 Platform |
|---|---|---|---|---|---|---|
| EAR | L1 | L2 | L2 | L3 | L4 | L5 |
| MOUTH | L0 | L1 | L1 + L2 | L3 + L4 | L4 | L5 |
| ATTENTION | L1 | L2 | L2 | L3 | L4 | L5 |
| HANDOFF | L0 | L0 | L1 | L2 | L2 | L3 + L4 |
| TURN-TAKING | L0 | L2 | L2 | L1 + L3 + L4 | L4 | L4 |
| RECALL | L0 | L1 | L1 | L2 | L3 + L4 | L5 |
| PERSONA | L1 | L1 | L2 | L4 | L4 | L5 |
| REACH | L1 | L1 | L1 | L2 | L2 | L3 + L4 |

---

## v0 — Listening Post

**Size:** two to three days. Nothing is shipped.

Run `opencode serve`. Write about fifty lines that connect to `GET /event` and dump every
event to a file. Then use OpenCode normally for a full day. Then read the log.

This is first on purpose. Do not design the speak-layer from documentation. Design it from the
real event log. It answers questions that are currently guesses: what `session.idle` actually
contains, whether `permission.asked` carries the option list, and what the text parts really
look like.

**Second job of v0:** test which available models reliably emit the `<<SPEAK>>` block. Send the
persona to each model in the account and check whether the block appears, correctly formatted,
ten times out of ten. Record the result in `docs/06-research.md`. This decides which model the
project develops against, and it decides how important the fallback path is.

**Exit condition:** the event log has been read, and at least one model emits the block
reliably.

---

## v1 — The Report

**Size:** about one week. Desk only. Output only.

The user keeps typing with Wispr Flow, unchanged. nuncio does not touch input at all.

**What is in it:**

- Persona injection with the `<<SPEAK>>` block contract
- Daemon watches for `session.idle`, extracts the block
- Fallback template when the block is missing
- Three distinct ping sounds: done, needs you, error
- A browser page on localhost that plays the ping and speaks the report on click
- TTS via the browser's built-in speech synthesis. No TTS engine to install.

**The question it answers:** does an ambient audio channel change how I work at the desk?

**The kill criterion:** use it for one week, then turn it off for two days. If you do not miss
it, stop the project.

**How to make the test fair.** The known risk in this ordering is that v1 sits next to a
keyboard, so it may feel pointless even if the idea is sound. The fix is a usage rule, not a
feature. During the v1 week, after sending a prompt you must physically leave the terminal —
open another window, start a test run, read something else. The value of v1 is only visible
when you are not staring at the terminal. If you sit and watch, reading will always win, and
you will have tested the wrong thing.

---

## v2 — The Unblock

**Size:** about one week. Desk only. The loop closes.

**What is added:**

- Push-to-talk in the browser page. Audio goes to the daemon, daemon runs local Whisper.
- Voice answers to permission prompts via `POST /session/:id/permissions/:permissionID`
- Path C keywords handled locally: repeat, slower, stop, louder
- The full five-state machine
- Reformatter for the ear: strip markdown, shorten paths
- Utterance and latency logging, for deciding Path B later

**The question it answers:** is a narrow voice loop actually better than walking back to the
keyboard?

**Why this is v2 and not later.** This is the one interaction where voice beats a keyboard even
at the desk. You are away from the terminal doing something else. The agent is blocked. You
unblock it in three words without going back. It is also the exact loop no competitor has
built. AgentsRoom does voice approvals but is desktop-only and macOS. The mobile clients do
approvals but need eyes on a diff.

**The demo this produces:** the agent got blocked while you were making coffee, you said "yes,
once", it kept going, you never touched the laptop.

---

## v3 — The Handoff

**Size:** about one to two weeks. The phone, on the same WiFi.

**What is added:**

- The daemon serves the same page on the LAN, discoverable over mDNS
- Full prompts by voice from the phone
- Typed and pasted input on the phone as a fallback
- Repo vocabulary bias for Whisper
- Persona becomes terser when the session is on the phone

Because audio already lives in the browser, this is largely the same page opened on a different
device. You are moving a loop you already know works. You are not debugging audio, networking,
and product value at the same time.

**The question it answers:** the real thesis. Does the session actually follow you?

---

## v4 — The Colleague

Turn-taking that feels human.

Push-to-talk barge-in. "Option one" mid-read. Risk-tiered spoken permissions. Queue by default
with abort-and-merge as an explicit spoken command. Named identity and a fixed voice. Two
voices so you know who is speaking. Read-back confirmation for high-stakes prompts. Ranking and
a speech budget. Liveness heartbeat. Explicit device handoff. Multiple concurrent sessions.

---

## v5 — The Memory

Path B. Transcript-backed instant answers. Cascade routing. A local model for the text the
agent did not mark. Cross-session memory. Voice bookmarks feeding a review list.

---

## v6 — The Platform

Claude Code adapter. Normalised event schema. Codex and Gemini. Off-network transport. Other
surfaces.

---

## Parking table

Nothing is deleted. Every idea has a track, a level, and a version.

| Idea | Track | Level | Version |
|---|---|---|---|
| `<<SPEAK>>` block, agent marks its own highlights | EAR | L1 | v1 |
| Fallback template when the block is missing | EAR | L1 | v1 |
| Reformatter: strip markdown, shorten paths | EAR | L2 | v2 |
| Ranking plus speech budget, "there is more, want it?" | EAR | L3 | v4 |
| Local classifier for unmarked text | EAR | L4 | v5 |
| Fine-tuned model on collected labels | EAR | L5 | v6+ |
| Push-to-talk with local Whisper | MOUTH | L1 | v2 |
| Typed fallback, paste, images | MOUTH | L2 | v3 |
| Repo vocabulary bias for Whisper | MOUTH | L3 | v3 |
| Read-back confirmation | MOUTH | L4 | v4 |
| Open mic with VAD, then wake word | MOUTH | L5 | v5+ |
| Three ping sounds, pull only | ATTENTION | L1 | v1 |
| Five-state machine | ATTENTION | L2 | v2 |
| Liveness heartbeat | ATTENTION | L3 | v4 |
| "Hey Jay, it is done" spoken ping | ATTENTION | L4 | v5 |
| Do-not-disturb awareness | ATTENTION | L5 | v5+ |
| LAN web page, mDNS | HANDOFF | L1 | v3 |
| Explicit "go mobile" switch | HANDOFF | L2 | v4 |
| Tailscale or relay | HANDOFF | L3 | v6 |
| Lock screen, headphone button, car mode | HANDOFF | L4 | v6 |
| Push-to-talk cancels audio | TURN-TAKING | L1 | v4 |
| "Option one" while it reads options | TURN-TAKING | L2 | v2 |
| Risk-tiered spoken permissions | TURN-TAKING | L3 | v4 |
| Queue default, explicit abort-and-merge | TURN-TAKING | L4 | v4 |
| True mid-turn steering | TURN-TAKING | L5 | blocked upstream |
| Utterance and latency logging | RECALL | L1 | v2 |
| Replay buffer for repeat/slower | RECALL | L2 | v4 |
| Transcript answers, small closed set | RECALL | L3 | v5 |
| General transcript Q&A, cascade routing | RECALL | L4 | v5 |
| Cross-session memory | RECALL | L5 | v6 |
| Voice bookmarks, "note that" | RECALL | L5 | v5 |
| Intern persona injection | PERSONA | L1 | v1 |
| Binary decision contract | PERSONA | L2 | v2 |
| Mode-dependent persona (desk vs phone) | PERSONA | L3 | v3 |
| Named identity, fixed voice, two voices | PERSONA | L4 | v4 |
| Multiple agents, distinct voices | PERSONA | L5 | v6+ |
| Multiple concurrent sessions | REACH | L2 | v4 |
| Claude Code adapter | REACH | L3 | v6 |
| Codex, Gemini | REACH | L4 | v6 |
| Slack, WhatsApp, hardware | REACH | L5 | not planned |
| Canvas / board interface | — | — | dropped |
| Multi-agent orchestration | — | — | dropped, saturated market |
| Port forwarding, remote preview | — | — | dropped |
