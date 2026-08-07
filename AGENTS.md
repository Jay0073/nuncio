# nuncio — Agent Instructions

**Read this file first. It is the entry point to the whole project.**

nuncio is a voice presence layer for OpenCode coding sessions. It runs as a local daemon on
the developer's laptop, watches the OpenCode session over HTTP and SSE, and gives it a voice.
The developer can be at the desk doing other work, or away from the desk with a phone. The
session stays reachable in both places.

Status as of August 2026: planning complete, no code written yet. Current version target is
**v0 (Listening Post)**.

---

## 1. Documentation index

Read the document that matches your task. Do not read all of them every time.

| Document | Read it when |
|---|---|
| [docs/01-vision.md](docs/01-vision.md) | You need to know what the product is and how to describe it |
| [docs/02-tracks.md](docs/02-tracks.md) | Someone proposes a feature and you need to place it |
| [docs/03-versions.md](docs/03-versions.md) | You need to know what belongs in the current version |
| [docs/04-architecture.md](docs/04-architecture.md) | You are writing or changing code |
| [docs/05-decisions.md](docs/05-decisions.md) | You want to know why something is the way it is, or you are reversing a decision |
| [docs/06-research.md](docs/06-research.md) | You need confirmed external facts: APIs, competitors, benchmarks |
| [docs/07-open-questions.md](docs/07-open-questions.md) | You are starting new work and want to know what is still unknown |
| [LOG.md](LOG.md) | You need the history of what changed and when |

---

## 2. Working rules

### Rule 1 — Log every meaningful change

After any meaningful change, add an entry to the **top** of [LOG.md](LOG.md). Newest entry
first.

A change is meaningful if it changes behaviour, changes a decision, adds or removes a
dependency, or moves the project between versions. Fixing a typo is not meaningful.

Use this format exactly:

```markdown
## YYYY-MM-DD — Short title

**Version:** v0 | v1 | v2 | ...
**Type:** setup | feature | fix | decision | docs | experiment
**Changed:** What is different now. Be concrete. Name the files.
**Why:** The reason. If it reverses an earlier decision, link to it in docs/05-decisions.md.
**Result:** What happened when it was tried. Write "not yet tested" if it was not.
```

Do not delete or rewrite old log entries. The log is append-only. If an entry was wrong, add
a new entry that corrects it.

### Rule 2 — Do not build above the current version

Every capability in this project has levels, defined in [docs/02-tracks.md](docs/02-tracks.md).
Each version uses a specific level of each capability, defined in
[docs/03-versions.md](docs/03-versions.md).

Before writing code, check which level the current version calls for. Build that level. Do not
build the level above it because it seems easy or because it seems obviously better.

This project exists partly to hold scope. The version grid is the mechanism.

If you believe a level should move to an earlier version, do not just do it. Propose it, get
agreement, then record it in [docs/05-decisions.md](docs/05-decisions.md) and
[LOG.md](LOG.md).

### Rule 3 — Every version has a kill criterion

Each version answers one question and has one kill criterion. They are in
[docs/03-versions.md](docs/03-versions.md). The kill criteria are real. If a version fails its
criterion, stop and say so. Do not quietly move on to the next version.

### Rule 4 — Never place an idea in "later"

When a new idea comes up, do not put it in a vague backlog. Place it on a track at a level in
[docs/02-tracks.md](docs/02-tracks.md), and add a row to the parking table in
[docs/03-versions.md](docs/03-versions.md).

Nothing is deleted. Everything gets a home. That is what keeps the idea space from becoming
chaotic again.

### Rule 5 — Record decisions, including reversals

[docs/05-decisions.md](docs/05-decisions.md) is the decision log. Append new decisions. When a
decision is reversed, mark the old one as superseded and link to the new one. Do not edit the
old text.

---

## 3. Writing style

The project owner is not a native English speaker. When writing documentation, comments, or
chat replies:

- Use short, clear sentences. One main idea per sentence.
- Say things directly and literally.
- No idioms and no figures of speech.
- Keep the full technical depth. Only the sentence style is simple, not the content.

---

## 4. Stack

- **Language:** TypeScript
- **Runtime:** Bun (Node is an acceptable fallback if Bun causes trouble on Windows)
- **OpenCode client:** `@opencode-ai/sdk` — official, generated from OpenCode's OpenAPI spec,
  handles the SSE stream. Do not hand-write an HTTP client.
- **Audio:** in the browser, never in the daemon. See
  [docs/04-architecture.md](docs/04-architecture.md) for why.
- **Target platform:** Windows 11. No NVIDIA GPU on the development machine.

---

## 5. Repository

- Private. Do not push to a public remote.
- Default branch: `main`.
- Commit messages: short imperative subject line, then a blank line, then the reason if it is
  not obvious.
