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

### D-017 — Define the adapter boundary in v1, implement only OpenCode
**Status:** active
The owner also uses Claude Code CLI and Antigravity CLI and wants nuncio to reach them
eventually. Implementation stays at Track REACH L3 and later, but the boundary is defined from
v1. See [04-architecture.md](04-architecture.md).

The load-bearing part: **adapters push events into nuncio; nuncio never pulls from an adapter.**
OpenCode is a stream you subscribe to. Claude Code is a set of hooks that call you. A
pull-shaped core cannot host Claude Code without a rewrite. A push-shaped core hosts both.

Adapters declare capabilities rather than being reduced to a common subset. If a CLI cannot
answer a permission programmatically, nuncio still pings and still speaks the question, and the
user answers at the keyboard.

This reverses the earlier advice to avoid abstraction until a second adapter exists. That advice
applies when the second case is imagined. Here it is known.

### D-018 — nuncio serves its own page; it never depends on a CLI's own UI
**Status:** active
Supersedes a note in `06-research.md` suggesting v3 could lean on OpenCode's web UI as the
screen client. Claude Code has no web UI. nuncio's page is minimal — talk button, playback,
ping, transcript — and is the same page on the desk and on the phone. It may link out to a
CLI's own UI when one exists, but must not require it.

### D-019 — Project config needs a git repo
**Status:** active
Not a design decision, a fact that bit us. OpenCode resolves a project by its git worktree.
Without `.git`, `/project/current` reports the `global` project with worktree `/`, and a
project-level `opencode.json` is never loaded — so permission settings silently do nothing.

Consequence for nuncio: when it starts, query `GET /project/current`. If the worktree is `/`,
warn the user that the server is not attached to a real project. Silent misconfiguration cost
us a day.

### D-020 — No persona. Only a style rule for the spoken summary.
**Status:** active
Supersedes S-012. "Intern" was an analogy for the **shape of the text**, not a character to
install. nuncio does not install a persona, a name, or behavioural instructions. It does not
tell the agent how to work, how to plan, when to ask questions, or how to code. That would be a
layer on top of the model's intelligence and would break the constraint about never changing
the agent.

The real problem is length and style. Claude Code writes long, jargon-heavy turns that are too
much to listen to. A bare outcome — "done, 20 tests pass" — is too thin and leaves out what
happened. The target is the middle: the parts of the detailed answer worth hearing, with real
names and real numbers.

Asking for a fuller *summary* is still only about the summary, so this does not break the rule.
A 90-word block costs perhaps 120 output tokens against a response already thousands long.

### D-021 — Three keys: did, decision, ask
**Status:** active
Was four (`done`, `decision`, `blocked`, `ask`). `done` invited outcome-only reporting, which is
the failure we are fixing. `did` invites a narrative. Failures, surprises and blockers belong in
`did` because they are part of what happened.

Fewer keys means better compliance across models, and compliance across models is what makes
Claude Code and Antigravity cheap later (D-017).

Length scales with the work rather than being fixed: under 25 words for a small turn, 40 to 90
for a real one, hard cap 120. `Report.overLength` records when a model runs past it, which is
the signal for tuning the contract.

### D-022 — The contract is installed through `opencode.json` → `instructions`
**Status:** active
In v1 the user types in the TUI, so nuncio never sees the prompt and cannot inject anything into
it. `bun run install-contract -- <project>` writes `.nuncio/spoken-report.md` and adds it to the
`instructions` array in the project's `opencode.json`. Per project, and reversible with
`--remove`.

Two consequences to remember: the server must be restarted to reload the config, and an existing
session keeps the instructions it started with.

### D-023 — The v1 measure replaces the one-week kill criterion
**Status:** active
The old criterion was "use it for a week, turn it off for two days, do you miss it". The owner
already knows the pain is real for him and is building for himself first, so that question is
answered and the week only delays the work.

What the week genuinely bought cannot be skipped, only compressed: you learn **what should be
spoken** by hearing the wrong things spoken. So the new measure is:

> Over 10 finished turns, how many times did the spoken report mean you did not need to look at
> the screen? Target 7 out of 10.

Measurable in an afternoon, and more useful. Below 7, fix the contract, not the idea.

### D-024 — "Tell me more" reads the buffer, not the CLI
**Status:** active
Going back to the agent for more detail costs a full round trip, 5 to 20 seconds of silence, and
tokens. It is also unnecessary: the detailed answer is already on screen and already in nuncio's
buffer. Reading from the buffer is instant, free, and cannot drift. Track RECALL L2, in v4.

A CLI round trip is only needed for a genuinely new question ("why did you pick that?"), not for
more detail on what was just said.

Principle to hold: **the first report should be right most of the time.** If "tell me more" is
needed every turn, the budget is wrong. Fix the budget, do not add a crutch.

### D-025 — The budget is enforced by the daemon, not by the prompt
**Status:** active
A cap that lives only in an instruction is not a cap. Real blocks ran from 10 to 431 words
against a stated maximum of 120, and nuncio spoke whatever it was handed.

The daemon now trims to a budget on a sentence boundary and keeps the remainder. The budget
scales with the work actually done, using the `file.edited` events already in hand: 45 words
for a turn that wrote nothing, 70 for one to three files, 100 for four or more.

"There is more" is offered **only when something was actually cut**. A short report is never
trimmed and never offers more.

Asking for more reads the remainder from memory. It never calls the agent (D-024), so it costs
nothing, takes no time, and cannot drift from what was written.

Track EAR L3, pulled forward from v4 because real use showed the cap was doing nothing.

### D-026 — Permissions are described, not read aloud
**Status:** active
Measured across a real capture, permission commands ran from 8 to 887 characters. The longest
was a PowerShell pipeline of quoted Windows paths — roughly two minutes of spoken punctuation.
After describing them: 69 to 257 characters, median 99.

Three rules:

1. **First person.** "I want to run", never "It wants to run". nuncio and the agent are one
   colleague, not a tool narrating another tool.
2. **Detail scales with risk.** In real use most permissions are auto-approved and only the
   dangerous ones reach the user's ears, so those deserve more words — including which real
   paths are touched. Unexpanded shell variables are skipped; "$base/alpha" tells you nothing.
3. **Short harmless commands are read out as they are.** Hearing the real command beats hearing
   a paraphrase of it.

Risk patterns are deliberately narrow. A false "that is destructive" trains the user to ignore
the warning, which is worse than not warning. An early version fired on
`git log --pretty=format:%h`.

Track TURN-TAKING L3, pulled forward from v4. v2 is answering permissions by voice, and you
cannot answer what you cannot understand.

### D-027 — Questions are asked the way a colleague asks
**Status:** active
Not "here is a question, here are three options". The `question.asked` event already carries a
description per option and marks the recommended one, so nuncio says what it would do and why,
then names the alternatives:

> "How should the CLI find the repositories? I would go with Scan current directory —
> recursively find .git folders under the working directory. The others are Explicit paths as
> arguments or Config file. Which one?"

Track EAR L2, pulled into v1.1 because the data was already there and cost nothing.

### D-028 — A queue of waiting items, not one slot
**Status:** active
Two bugs from real use, both caused by holding a single waiting item.

1. `status busy=true` cleared it, and OpenCode fires `busy` roughly 17 times per turn. A spoken
   question or permission was wiped moments after arriving — which is why questions seemed to
   lose their options in v1. Items that **block the agent** now survive `busy`. A stale report
   is still cleared, because new work makes it stale.
2. The capture shows `permission.asked` immediately followed by another. Several can be in
   flight, and a single slot silently dropped all but the last.

Reports queue **behind** anything blocking the agent, because an unanswered permission has
stopped the work and matters more than a summary.

### D-029 — Context lives inside `did:`, not in a separate `about:` key
**Status:** active
The reports were unhelpful because they assumed the listener had been watching. "Fixed the wrong
data issues" is a receipt: you do not know there were data issues, which file, or why it
mattered.

The fix considered was a fourth key, `about:`. Rejected for two reasons:

1. **It breaks the narrative.** A separate field is spoken as its own chunk with a pause after
   it, so you hear two statements instead of one story. A person says it as one flow: "The
   digest was showing dates a day off for evening commits. Three places assumed UTC…"
2. **It only proves a line is present, not that it is useful.** A model can write
   `about: The date handling` and pass the check while telling you nothing. That is a false
   sense of verification bought at the cost of the flow.

Instead `did:` has an explicit three-part shape: what this is about (naming the thing, where it
lives, why it mattered), what you found and did, where it ended up. Three keys stay.

The governing line in the contract is: **write it for someone who has not seen your response,
has not seen the code, and does not remember this project.**

### D-030 — Pauses follow structure and density, not punctuation
**Status:** active
Uniform sentence-by-sentence gaps sound like a metronome. Two signals give real pacing for free:

- **Field boundaries are topic changes** — 800ms between `did`, `decision` and `ask`.
- **Density earns a beat** — 150ms plus 15ms per word of the sentence just spoken, capped at
  450ms. A 25-word sentence gets time to land; a 6-word one barely pauses.

This matters more than it looks: the owner is not a native English speaker and reads in bursts.
A continuous stream at one pace is what breaks comprehension, and a nicer voice does not fix it.

Browsers ignore SSML break tags, so this cannot be marked up. Each sentence is its own utterance
and the silence between them is real waiting.

### D-031 — A turn that changed nothing gets the LARGEST budget
**Status:** active
The first budget scaled purely by files changed, so a no-change turn got 45 words — the
smallest. That is backwards. An audit changes no files and is the longest report type: asked to
review one function, the agent found seven real problems and only two of them fitted.

The rule that holds: **a code-change turn should be concise** because the diff is on screen and
you can read it (70 words, 100 for four or more files). **A turn that changed nothing has
nothing to look at instead** — the words are the deliverable (90 words).

A short report is never cut, so the larger budget only ever applies where there is genuinely a
lot to say.

### D-032 — One finding per sentence, with a splitter as backstop
**Status:** active
Asked to review a function, the agent wrote all eight findings as a single 62-word comma list.
It could not be chunked and did not fit the budget, so **every finding** was pushed to "More"
and the spoken half was three sentences of preamble and nothing else.

Two fixes, because the instruction alone is not enough:

1. The contract asks for one sentence per finding, with a worked before-and-after.
2. `splitLong` breaks any sentence over 28 words at its comma and semicolon joints. A sentence
   with no commas is left whole rather than butchered.

After both: all five findings fit in the spoken half.

### D-033 — Quiet and Live are modes the user picks, not states nuncio guesses
**Status:** active
The owner asked for GPT-Live-style narration during the run, which conflicts with D-003.

"Speak when the page is focused" was considered and rejected: focus is a desk concept, and the
moment you are walking with earphones there is no page to focus. It fails exactly where the
product is meant to win.

So it is an explicit mode, remembered between sessions:

- **Quiet** (default) — tones only, speaks when asked. The junior-developer model, which is how
  the owner described what he actually wants: a junior does not narrate every change, he tells
  you when you ask.
- **Live** — plays each report as it arrives. For walking with earphones.

D-003 stands as the default rather than being reversed.

### D-034 — A block that echoes the template is treated as no block
**Status:** active
A model that copies the skeleton instead of filling it in produces a block that parses perfectly
and says nothing. Speaking "what happened, in order, with the real names" aloud is worse than
silence, so placeholder text is filtered like `none` and `N/A` are.

### D-035 — Progress is the agent's own mid-turn narration, not `<<STEP>>` markers
**Status:** active
Supersedes the plan to have the agent emit `<<STEP>>` lines.

Measured on a real multi-step task with tools: the agent emitted **zero** step markers. It did
write **three text parts**, and the first one was:

> "Blank repo — no package.json, no test framework. Node v24 is installed, which has a built-in
> test runner and native TypeScript support, so I'll use those instead of adding dependencies."

That is exactly the progress the owner wanted, written unprompted, for free. nuncio was throwing
it away — it kept only the **last** text part, which is the one carrying the report.

So: a text part **without** the `<<SPEAK>>` block is progress. The part **with** the block is the
report. This costs the model nothing, cannot fail to comply, needs no contract instruction, and
it is the agent's own voice rather than a format we imposed.

The `<<STEP>>` instruction stays in the contract and any markers a model does emit are merged
in, but nothing depends on them.

This also explains the owner's report that acknowledgements "used to come": they always existed
on screen. They simply never reached his ears.

Consequence: `assistant.text` now carries a `partId`, because a part is re-sent as it grows and
must replace itself rather than be counted twice.

### D-036 — Contract rules must be scoped to the block, loudly and repeatedly
**Status:** active
The owner reported that OpenCode stopped writing its usual "let me look at that" narration on
screen. That was nuncio's fault. Rules meant for the block — "never narrate the kind of turn it
was", "never write 'let me explain what I did'" — read as general style advice, and the model
applied them to its whole response.

**That broke the project's first constraint: nuncio must never change how the agent behaves.**

The contract now opens with a Scope section stating that every instruction applies to the block
and nothing else, that the on-screen answer must not change, and that if the model finds itself
writing more briefly on screen it should stop. Individual rules repeat the scoping inline.

Worth remembering as a general lesson: an instruction placed in the agent's context will leak
into everything the agent does unless it is fenced explicitly and more than once.

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

### S-012 — The "intern persona" with behavioural instructions
**Superseded by D-020.** The plan was to inject behavioural directives — confirm understanding
before acting, ask clarifying questions proactively, lead with outcomes, do not narrate steps.
That is a persona, and it changes how the agent works.

The intern was only ever an analogy for the shape of the text. What survives is a style rule for
the spoken summary. Nothing about how the agent operates.

### S-013 — Four block keys, fixed length
**Superseded by D-021.** `done` invited "it is finished" and nothing more, which is the exact
failure being fixed.

### S-014 — v3 can lean on OpenCode's web UI as the screen client
**Superseded by D-018.** Claude Code has no web UI.
