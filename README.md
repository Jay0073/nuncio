# nuncio

A voice presence layer for OpenCode coding sessions.

Latin *nuntius*: the messenger who carries word between two parties.

## What it does

OpenCode runs in server mode on your laptop. nuncio is a separate local daemon. It watches the
session, and gives it a voice.

You give work by speaking. The agent works. You go and do something else. nuncio pings you
quietly when the agent is done or stuck. You open the channel when you are ready, and it tells
you only the parts that matter. You answer by speaking.

When you leave your desk, the session comes with you to your phone over your own WiFi. No
cloud in between. Everything runs on your laptop.

The screen never goes away. You look at it whenever you want. The voice channel is a second,
thinner channel that runs beside the screen, so you are not tied to the screen while the agent
works.

## Status

Current version: **v0 — the Listening Post.** No product code yet. v0 exists to replace
guesses with measurements.

See [AGENTS.md](AGENTS.md) for the documentation index.

## Running v0

Requires [Bun](https://bun.sh) and `opencode`.

```bash
bun install
```

### 1. Capture the event stream

In one terminal:

```bash
opencode serve --port 4096
```

In another terminal, from the project root:

```bash
bun run listen
```

Now use OpenCode normally for a full day. Let it finish tasks. Let it ask for permission. Let
it hit an error. Press Ctrl+C when done to see a summary.

Everything is written to `events/events-<date>.jsonl`. That directory is git-ignored.

### 2. Read what was captured

```bash
bun run analyze                          # counts, plus samples of the events v1 and v2 need
bun run analyze -- --type session.idle   # every sample of one event type
bun run analyze -- --samples 5           # more samples per type
```

This answers open questions 1 and 2 in [docs/07-open-questions.md](docs/07-open-questions.md):
what `session.idle` actually contains, and whether the permission event carries the option
list.

### 3. Test the model

```bash
bun run model-test                       # 10 runs against OpenCode's default model
bun run model-test -- --runs 5
bun run model-test -- --model provider/model-id
```

This measures whether the model reliably emits the `<<SPEAK>>` block. It prints a markdown
table ready to paste into [docs/06-research.md](docs/06-research.md), and writes every raw
response to `events/` so a failure can be inspected by hand.

### Other commands

```bash
bun test           # unit tests for the block parser
bun run typecheck
```

If OpenCode is on a different port, set `OPENCODE_URL`.

## Not the pitch

This is not "eyes-free development". You cannot review a diff by ear and nuncio does not
pretend otherwise. The claim is narrower and true: **stay in the loop without being tied to
the screen.**
