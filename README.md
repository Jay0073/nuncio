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

Planning complete. No code yet. Current target is v0 — the Listening Post.

See [AGENTS.md](AGENTS.md) for the documentation index.

## Not the pitch

This is not "eyes-free development". You cannot review a diff by ear and nuncio does not
pretend otherwise. The claim is narrower and true: **stay in the loop without being tied to
the screen.**
