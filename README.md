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

**Important:** running `opencode` on its own starts its *own* server on a random port. It does
not join a server you already started. If you do that, the listener sees only heartbeats,
because your work is happening on a different server.

Use `opencode attach` so that the TUI and the listener share one server.

Three terminals:

```bash
# Terminal 1 — the shared server
opencode serve --port 4096

# Terminal 2 — the listener, from the nuncio project root
bun run listen

# Terminal 3 — your actual work, attached to the same server
cd path/to/whatever/you/are/working/on
opencode attach http://localhost:4096
```

`OPENCODE_API_URL=http://localhost:4096 opencode` does the same thing if you prefer an
environment variable.

**How to know it is working:** terminal 2 should show `session.*` and `message.*` events as
soon as you type in terminal 3. If all you see is `server.heartbeat` every 10 seconds, the TUI
is not attached.

Now use OpenCode normally for a full day. Two things matter most: let a task run all the way
to completion, and let it ask you for permission at least once. Those are the events v1 and v2
are built on. Press Ctrl+C in terminal 2 when done to see a summary.

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
bun run model-test                                  # 10 runs, OpenCode's default model
bun run model-test -- --model opencode/big-pickle
bun run model-test -- --model opencode/big-pickle --model opencode/claude-sonnet-5
bun run model-test -- --runs 5 --timeout 180
```

The default task needs no tools, on purpose. A task that calls a tool triggers a permission
request, and in a headless server with nothing answering permissions that blocks forever. Do
not use `--tools` until the permission flow is understood.

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
