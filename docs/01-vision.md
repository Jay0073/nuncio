# 01 — Vision

## The product in one paragraph

A coding session should have a presence. It runs on your laptop. You give it work by speaking.
It works. You go and do something else. It tells you, quietly, when it is done or when it is
stuck. You open the channel when you are ready, and it tells you only the parts that matter.
You answer by speaking. When you leave your desk, the session comes with you to your phone,
over your own network, with no cloud in between. The screen never goes away. You look at it
whenever you want. The voice channel is a second, thinner channel that runs beside the screen,
so you are not tied to the screen while the agent works.

## How to describe it

Use: **"stay in the loop without being tied to the screen."**

Do not use: **"eyes-free development."** People will test that claim as "I never look at the
screen" and it will fail. You cannot review a diff by ear, and nuncio does not pretend
otherwise.

## The base scenario is the desk, not the walk

The developer is sitting at the laptop. The session runs on the laptop. Nothing moves to a
server.

The change is not "voice replaces the screen". The change is that the developer stops being
tied to the screen while the agent works. He gives the instruction. Then he goes and does
something else — testing, another task, thinking. The agent works. He stays informed without
watching.

The right comparison is **"doing other work while staying informed"** against **"sitting and
watching a terminal."** It is not "listening to a response" against "reading a response". If
you sit and watch, reading will always be faster. That is not what is being tested.

## The phone is continuity, not a second product

He is working at the desk. He needs to leave. He leaves the laptop running. The session moves
to his phone. The phone connects to his own laptop over the local network.

Everything still runs on the laptop. There is no central server. The phone is a microphone, a
speaker, and a screen he can look at if he wants to.

## What gets spoken is a selection, not a summary

nuncio does not read the response aloud. It also does not compress the response into a shorter
version. It chooses which parts of the response need to reach the ear, and speaks only those.

The full response is still there, in the terminal, untouched. If the user wants the exact
text, he looks at the screen. Nothing is hidden and nothing is replaced.

## The content model: the junior developer report

When a junior developer reports to you, you do not get their full work. You get four things:

- what is finished
- what decision they made that you might disagree with
- what is blocked
- what they need from you

That is the content model. It turns a vague instruction ("decide what is worth speaking") into
a concrete list, which is far easier to build and to test.

## What nuncio is not

- **Not a multi-agent orchestrator.** That space is saturated: AWS CAO, October.dev, Conductor
  OSS, Cate, Nimbalyst, Agor and more.
- **Not a wrapper around the CLI.** It talks to OpenCode's own server API.
- **Not a read-it-aloud TTS tool.** Eight OpenCode plugins already do that. Being dumb is
  exactly the gap.
- **Not a voice-optimised model.** Voice routes through the full agent, not through a smaller
  streaming model.
- **Not a remote development environment.** No port forwarding, no remote preview.

## Claims to avoid

Do not build the pitch on "voice makes better prompts". The evidence for it is vendor
marketing plus one person's experience. The product does not need that claim.

"I can work on something else and stay informed" needs no study to justify. Use that.
