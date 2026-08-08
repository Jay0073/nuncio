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

Current version: **v1 — The Report.** Built and working end to end.

See [AGENTS.md](AGENTS.md) for the documentation index.

## Running v1

Requires [Bun](https://bun.sh) and `opencode`. Run `bun install` once.

### One-time, per project

The project **must be a git repository**. OpenCode resolves a project by its git worktree, and
without one it silently ignores the project config — including nuncio's contract.

```bash
cd C:\path\to\your\project
git init                                    # if it is not a repo yet
```

From the nuncio folder, install the spoken report contract into that project:

```bash
bun run install-contract -- C:\path\to\your\project
```

That writes `.nuncio/spoken-report.md` and adds it to `instructions` in the project's
`opencode.json`. Reverse it any time with `--remove`.

### Every session — three terminals

```bash
# 1. The shared server, started INSIDE the project
cd C:\path\to\your\project
opencode serve --port 4096

# 2. nuncio, from the nuncio folder
bun run v1
#    -> open http://127.0.0.1:4747 and press "Enable sound" once

# 3. Your work, attached to the same server
cd C:\path\to\your\project
opencode attach http://localhost:4096
```

Running plain `opencode` starts its **own** server on a random port and nuncio will see
nothing. Use `opencode attach`.

### What happens

Work normally. When a turn finishes, nuncio plays a short tone:

| Tone | Meaning |
|---|---|
| two notes rising | done |
| three quick notes | it needs an answer from you |
| two notes falling | error |

nuncio never speaks on its own. When you are ready, click **Listen** and it reads the summary
the agent wrote. If the agent wrote no summary, it says so and tells you to check the screen —
it will never read the raw response aloud.

Long reports are cut to a budget that scales with the work done — 45, 70 or 100 words by how
many files changed. When something is held back, a **More** button appears and the report ends
with "there is more, if you want it". **More reads from memory.** It never goes back to the
agent, so it costs nothing and takes no time.

Permissions and questions are described rather than read out. A 900-character shell command
becomes "I want to run a 19-step command that deletes files and creates folders. That is
destructive. It touches standup/build. Check the screen before allowing it."

## After changing the contract

`src/report-contract.ts` is sent to the agent, so changing it needs three steps:

```bash
bun run install-contract -- C:\path\to\your\project   # rewrite the file
# restart 'opencode serve'                            # reload the config
# start a NEW session in the TUI                      # old sessions keep old instructions
```

The `<<SPEAK>>` block is visible in your terminal. nuncio sits outside the CLI and cannot edit
what the TUI prints. It is short, and it is a useful check on what nuncio received.

`OPENCODE_URL`, `NUNCIO_PORT` and `NUNCIO_HOST` override the defaults.

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
