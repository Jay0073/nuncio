# Change Log

Newest entry first. Append-only — never edit or delete an old entry. If an entry was wrong,
add a new one that corrects it.

Format is defined in [AGENTS.md](AGENTS.md), Rule 1.

---

## 2026-08-09 — Measured what `<<STEP>>` markers cost. 40 runs.

**Version:** v1.2 (planning)
**Type:** experiment
**Changed:** `src/report-contract.ts` now exposes `buildContract({ steps })` and `parseSteps`.
`bun run model-test -- --compare` runs both variants and reports compliance, latency and report
length side by side.

**Why:** I told the owner that STEP markers "may hurt compliance" with no evidence. He asked
for numbers instead of a hedge. He was right to.

**Result — 40 runs, two models, ten per cell:**

| | Base | With STEP | Change |
|---|---|---|---|
| Block emitted | 20 / 20 | 19 / 20 | −5 points, one failure |
| Median latency | 9.7s | 10.0s | +3% |
| Median report length | 44 words | 58 words | +32% |

**The important findings are not the headline number:**

1. **Compliance is not the problem at all.** 20 out of 20 on the base contract. The format is
   being followed. So the reports being unhelpful is a *content* problem, and no amount of
   format work will fix it.
2. **Zero step markers were emitted in any of the 20 STEP runs.** The task had no tools and no
   milestones, so there was nothing to narrate. This measured the cost of the instruction and
   not its benefit. The benefit is still unmeasured.
3. **Reports got 32% longer with the STEP section.** Unexpected, larger than the compliance
   cost, and it works against the budget we just added.

**Recommendation:** do not add STEP markers yet. Fix the content problem (`about:` and depth by
turn type) first and measure that alone. Adding both at once means not knowing which helped,
and the +32% length would confound the length work directly.

**Honest limit:** one failure in twenty cannot be distinguished from noise at n=10. "No large
cost" is supported. "Exactly 5%" is not.

---

## 2026-08-09 — v1.1: four fixes from real use

**Version:** v1.1
**Type:** fix
**Changed:**

- `src/core/budget.ts` (new) — the speech budget. Trims on a sentence boundary, keeps the rest.
- `src/adapters/describe.ts` (new) — permission and question phrasing.
- `src/core/state.ts` — a queue of waiting items instead of one slot.
- `src/core/report.ts` — reports now carry `rest` and `fullWords`.
- `src/report-contract.ts` — length rules by turn type; no meta-narration; do not compress what
  is already brief; first person.
- `src/web/index.html` — a **More** button, shown only when something was held back.

**Why:** The owner used v1 to build a real project rather than testing it. The measure came back
below target — the reports were good, but they did not remove the need to look at the screen.

**Result — the four things, and what the data said:**

1. **Permissions were unusable by ear.** Measured across the capture, commands ran 8 to 887
   characters; the longest was a PowerShell pipeline of quoted Windows paths. Now described
   rather than read: **69 to 257 characters, median 99**. Replayed all 51 real permissions to
   confirm. In the first person, with detail scaled by risk, and naming the real paths a
   destructive command touches.
2. **Spoken questions lost their options.** They were never lost — the waiting item was cleared
   by the next `busy` event, and `busy` fires about 17 times per turn. Items that block the
   agent now survive it. The capture also shows `permission.asked` back-to-back, so a single
   slot was dropping all but the last; there is now a queue.
3. **The 120-word cap did nothing.** Real blocks ran 10 to 431 words. The daemon now enforces a
   budget that scales with the work — 45 / 70 / 100 words by files changed — and holds the rest.
   "There is more" appears only when something was actually cut.
4. **Reports padded and missed things.** The v1 report literally opened with "I answered your
   question about... I did not run any tools" — two sentences of waste. Length now follows what
   was asked rather than how long the work took, and an explanation turn gives the answer
   itself instead of describing that it answered.

Also: questions are now asked the way a colleague asks — recommendation, reason, then the
alternatives. The event already carried a description per option and marked the recommended
one; v1 threw both away.

**Bugs found while writing this, worth remembering:**

- `.git folders` and `index.ts` were being cut in half, because a full stop was treated as a
  sentence end regardless of what followed. Both sentence splitters now require whitespace or
  end-of-string after the punctuation.
- The destructive-risk pattern fired on `git log --pretty=format:%h`, because `format` was a
  bare word. A false "that is destructive" trains you to ignore the warning, which is worse
  than not warning. Patterns are narrow now.
- Unexpanded shell variables were being spoken as paths. "$base/alpha" tells you nothing about
  which real folder is at risk, so they are skipped.

**Verified:** 115 tests pass, typecheck clean, and all 51 real permissions plus all 6 real
questions from the capture were replayed through the new code.

**Still to do by the owner:** re-install the contract (it changed), restart the server, start a
new session, and take the measure again.

---

## 2026-08-08 — v1 built and verified end to end

**Version:** v1
**Type:** feature
**Changed:**

- `src/report-contract.ts` — replaces `src/persona.ts`. The `<<SPEAK>>` contract, its parser,
  `stripSpeakBlock`, `renderForSpeech`. Three keys now: `did`, `decision`, `ask`.
- `src/core/events.ts` — the six normalised event kinds and the `AgentAdapter` interface (D-017).
- `src/core/state.ts` — the state machine. Pure, no I/O.
- `src/core/report.ts` — builds the spoken report from the block, or the D-013 fallback.
- `src/adapters/opencode.ts` — maps the OpenCode event stream onto normalised events.
- `src/server/serve.ts` — HTTP and WebSocket, serves nuncio's own page (D-018).
- `src/web/index.html` — the page. All audio lives here (D-012). Tones are generated with
  WebAudio, so there are no sound files to ship.
- `src/v1/main.ts` — wiring. `bun run v1`.
- `src/v1/install-contract.ts` — writes `.nuncio/spoken-report.md` and adds it to
  `instructions` in the project's `opencode.json` (D-022). Reversible with `--remove`.

**Why:** v1 answers whether an ambient audio channel changes how work feels at the desk.

**Result — verified, not assumed.** 67 tests pass, typecheck clean. Then run for real against a
live `opencode serve`: installed the contract into the `standup` project, started `bun run v1`,
drove a turn through `POST /session/:id/prompt_async`, and watched the whole path. nuncio's
project check correctly detected the `standup` worktree. The page serves and carries the
WebSocket. The final state was:

```
state: PENDING, ping: needs-you, source: block
"I answered your question about why a CLI should use git log with the no pager flag.
 ... One decision: I kept the answer to two sentences, as you asked.
 Do you want an example command you can run to see the difference?"
```

`needsYou` was true because the block contained an `ask`. That is the whole loop.

**A real bug the end-to-end run caught, which the unit tests did not.** The first run fell back
even though the agent had written a block. The reducer treated every `session.status busy=true`
as the start of a new turn and cleared the accumulated text. OpenCode emits `busy` once per
step — the v0 capture has 204 status events for 12 turns — so the text was wiped moments before
the turn finished. Every report would have been the fallback.

Fixed: the accumulators are cleared when they are **consumed** in `turn.finished`, not when a
turn appears to start. `busy` only clears them when the session changes. Four regression tests
cover it.

Worth noting for later: unit tests written from an assumed event order would not have found
this. Only real traffic did.

---

## 2026-08-08 — "Persona" was the wrong idea; it is a style rule

**Version:** v1
**Type:** decision
**Changed:** Added D-020 through D-024, superseded S-012 through S-014, rewrote Track 7 in
`docs/02-tracks.md` from PERSONA to REPORT, and renamed the grid row in `docs/03-versions.md`.

**Why:** The owner corrected a misreading. "Intern" and "junior developer" were an analogy for
the **shape of the text**, not a character to install. The plan had drifted into injecting
behavioural instructions — confirm understanding before acting, ask clarifying questions
proactively — which is a layer on top of the model's intelligence and breaks the constraint
about never changing the agent.

**Result:**

1. **No persona.** Only a style rule for the spoken summary. Nothing about how the agent works.
2. **Three keys instead of four** (D-021). `done` invited "it is finished" and nothing more,
   which is the exact failure being fixed. `did` invites a narrative. Blockers and surprises
   belong in `did` because they are part of what happened.
3. **Length scales with the work**, 25 to 90 words, hard cap 120. `Report.overLength` records
   overruns, which is the tuning signal.
4. **The one-week kill criterion is replaced** (D-023) by: over 10 finished turns, how many
   times did the report mean you did not need the screen? Target 7 of 10.
5. **"Tell me more" will read the buffer, not the CLI** (D-024). The detail is already on
   screen. A round trip costs 5 to 20 seconds of silence and cannot be more accurate.

The correction also made the project **smaller and safer**. nuncio no longer claims to improve
the agent. It only asks for a spoken summary, which is far easier to defend and far more likely
to behave the same on Claude Code and Antigravity.

---

## 2026-08-08 — Multi-CLI adapter boundary, and the git/permissions root cause

**Version:** v0
**Type:** decision
**Changed:** Added D-017, D-018, D-019 to `docs/05-decisions.md` and a new "adapter boundary"
section to `docs/04-architecture.md`.

**Why:** The owner also uses Claude Code CLI and Antigravity CLI and wants nuncio to reach them
eventually. That changes two things we had already written down, so it is better known now than
after v1.

**Result:**

1. **The core must be push-shaped.** OpenCode is a stream you subscribe to. Claude Code is a set
   of hooks that call you. A core built around "subscribe to a stream" cannot host Claude Code
   without a rewrite. A core built around "adapters emit events into nuncio" hosts both. Six
   normalised event kinds and a small adapter interface are now written down.
2. **nuncio serves its own page (D-018).** This reverses an earlier note that v3 could lean on
   OpenCode's web UI. Claude Code has no web UI.
3. **D-006 looks better than before.** Because the agent produces the `<<SPEAK>>` block, the
   speak-layer is already CLI-agnostic. Per-CLI work reduces to "get the final text" and "know
   when a turn ended". The rejected alternative — classifying the raw event stream with a local
   model — would have needed a separate routing table per CLI.

**Separately — root cause of the missing permission events (D-019).** Permissions never fired
because OpenCode resolves a project by its **git worktree**. The `standup` folder had no `.git`,
so `/project/current` returned the `global` project with worktree `/`, and the project-level
`opencode.json` was never read. Verified directly: before `git init` the worktree was `/`, after
`git init` it was the real path with `vcs: "git"`. The config was correct the whole time.

nuncio should check this at startup and warn, rather than let it fail silently.

---

## 2026-08-07 — First real capture: 3779 events over 9 hours

**Version:** v0
**Type:** experiment
**Changed:** Nothing in code. Findings written into `docs/06-research.md`.

**Why:** v0 exists to replace guesses with measurements. This is the measurement.

**Result — the four things that change the v1 design:**

1. **`message.part.updated` with `part.type === "text"` carries the complete assistant answer**,
   not a fragment. v1 reads the finished text off one event. It does not need to reassemble the
   2099 `message.part.delta` events. This is the single most useful finding.
2. **`session.idle` carries only `{ sessionID }`.** No file count, no token count, no summary.
   The D-013 fallback report cannot be built from it. It has to come from the message parts.
3. **`session.status` is exactly `{type:"busy"}` or `{type:"idle"}`.** That is a clean signal
   for the WORKING and IDLE states in the Track ATTENTION L2 state machine. Cleaner than
   inferring from `session.idle`.
4. **`message.updated` fires for user messages too.** v1 must filter on
   `info.role === "assistant"` or it will react to its own user's input.

**Result — what is still missing, and why v0 is not finished:**

- **No permission event fired in 3779 events.** The whole of v2 depends on this, and the
  conflict between `{ response, remember? }` and `{ allow: true }` is still unresolved.
- **Every `session.diff` and `summary.diffs` was empty.** The captured session was read-only.
  The shape of a real diff is still unknown, and the fallback report needs it.
- **The model reliability test has not been run properly** — only a one-run smoke test.

**Also noted:** the captured session ran on `opencode/deepseek-v4-flash-free`, not
`opencode/big-pickle`. D-015 assumes the default is Big Pickle. Confirm which is actually
selected.

**Also noted:** OpenCode's own web UI already shows the live chat, the tools, the commands, and
raises a browser notification when a turn ends. This makes v3 smaller — nuncio's page does not
need to reproduce a chat interface, only the audio surface.

---

## 2026-08-07 — Fixed three real defects found on the first live run

**Version:** v0
**Type:** fix
**Changed:**

1. **Credential leak.** `model-test.ts` read the provider config over the API and printed it.
   That object contains live API keys in plaintext, and one was printed to the terminal. The
   script now uses `opencode models` for the model list, which contains no credentials, and a
   `redact()` function scrubs any secret before anything is written or printed. The exposed
   OpenCode Zen key must be rotated by the owner.
2. **The workflow instruction was wrong.** Running `opencode` starts its own server on a random
   port. It does not join `opencode serve`. Following the old README produced a listener that
   saw only `server.heartbeat`, because the work was happening on a different server. The fix
   is `opencode attach http://localhost:4096`. README rewritten with three terminals and a
   "how to know it is working" check.
3. **The model test hung forever on run 1.** The default task asked the model to count files,
   which needs a tool call, which raises a permission request. In a headless server with
   nothing answering permissions, `session.prompt` never returns. The default task now needs no
   tools, every call has a timeout, and each run reports its elapsed time.

Also added: `import.meta.main` guards on all three v0 entry points, so importing a function
from one of them does not execute the script.

**Why:** All three were my defects, not usage mistakes. The first is a security problem, the
second made v0 impossible to run, the third made it look broken.

**Result:** `bun test` — 22 pass, 0 fail. `bun run typecheck` — clean. The model test now
completes a run in 6 to 10 seconds against the default model and prints a results table.

**Findings recorded in docs/06-research.md:**
- `opencode attach` confirmed in CLI 1.18.3. This validates the whole architecture: the TUI,
  nuncio and the web UI can all attach to one server and see the same session. That is exactly
  the mechanism the v3 phone handoff needs. The phone is one more client, not a copy.
- **An unanswered permission stops the agent completely.** This makes the v2 permission loop
  the central feature it was designed to be, and it gives nuncio a reliable way to detect a
  blocked agent for the "needs you" ping.
- `opencode serve` warns that `OPENCODE_SERVER_PASSWORD` is unset and the server is unsecured.
  Fine on localhost. Must be set before v3 binds to the LAN.
- 399 models are available through the `opencode` provider. The exact default is
  `opencode/big-pickle`.
- The model wrote `ask: none` instead of omitting the line, which would have been spoken aloud
  as the word "none". The persona now forbids it and `parseSpeakBlock` filters placeholder
  values regardless. Trust the filter, not the instruction.

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
