# 07 — Open Questions

Questions that are not yet answered. Each says which version answers it. When one is answered,
move the answer into the right document and record it in [LOG.md](../LOG.md).

---

## Answered by v0

**1. What does `permission.asked` actually contain?**
Does it carry the option list, or only the request text? The whole v2 permission loop depends
on this. If the options are not in the event, they must be fetched or inferred.

**2. What does `session.idle` actually contain?**
Enough to build a fallback report without the `<<SPEAK>>` block? File counts, token counts,
snapshot hash?

**3. Which available models emit the `<<SPEAK>>` block reliably?**
Test each model ten times. Record exact model IDs in
[06-research.md](06-research.md). This decides which model the project develops against.

**4. Are the OpenCode issue numbers in [06-research.md](06-research.md) still accurate?**
They were gathered in a prior session and not re-verified.

---

## Answered by v1

**5. Does an ambient audio channel change how work feels at the desk?**
This is the v1 kill criterion. See [03-versions.md](03-versions.md).

**6. How long should the spoken report be?**
Needs real use. Feeds the speech budget design in Track EAR L3.

**7. Are the browser's built-in voices good enough, or is the quality bad enough to hurt the
test?**
If the voice is unpleasant, the v1 result may be a false negative.

---

## Answered by v2

**8. What is Piper's real time-to-first-audio on this CPU?**
Only matters if the browser voices are not good enough. The inherited benchmark of ~1510ms on
CPU is the risk.

**9. How accurate is whisper.cpp on code terms without a vocabulary bias?**
Decides how urgent Track MOUTH L3 is.

**10. How often are retrospective questions actually asked, and how slow is the agent on
them?**
This is the instrumentation that decides whether Path B is worth building in v5.

---

## Answered by v3

**11. What exactly moves PENDING to SPEAKING on the phone, given iOS and Android gesture
rules?**
The test device is Android, so iOS is a later problem.

**12. Does mDNS discovery work reliably on the home network, or does the phone need a typed IP
address?**

---

## Not tied to a version

**13. Is the low traction on competitors an execution problem or a demand problem?**
The cheapest way to settle it is to install `renjfk/opencode-voice` and use it for a week. Worth
doing before or during v1.

**14. Does the `<<SPEAK>>` block survive well across different models, or does it need
per-model tuning?**
Related to question 3 but broader. Matters if nuncio is ever shared with other people.

**15. Should the `<<SPEAK>>` block be published as an open contract?**
An ecosystem that other voice tools adopt would be a stronger position than a fine-tuned
model. Costs almost nothing to try. Decide after v3.

**16. What is the real name of this tool?**
`nuncio` is provisional.
