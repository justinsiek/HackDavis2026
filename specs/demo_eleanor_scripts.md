# Eleanor Brooks — 2-Minute Demo Scripts

Two short visit scripts (~25s each) for a 2-minute demo. Plain language so non-clinical judges can follow.

1. **Doctor 1** admits Eleanor → records Visit 1 → admission note generates.
2. **Doctor 2** opens Eleanor's record → asks Clair a clarifying question → records Visit 2.
3. **Doctor 1** comes back → "What's Changed" surfaces real, meaningful deltas.

Cast: **Doctor 1**, **Doctor 2**, **E** (Eleanor, 78).

---

## Visit 1 — Doctor 1 admits Eleanor

> **Doctor 1:** Eleanor, what happened this morning?
>
> **E:** I stood up from the couch, got really dizzy, and fell. Hit the right side of my head. My doctor put me on a new blood pressure pill three weeks ago, and I take ibuprofen for my knees.
>
> **Doctor 1:** Okay Eleanor, your blood pressure drops a lot when you stand up — that's almost certainly what caused the fall this morning. I'm going to stop that new blood pressure pill for now and get some fluids into you. We'll also run a quick head scan to make sure there's no bleeding from where you hit your head. We're going to keep you here tonight to watch you closely.

→ Admission note generates from this visit.

---

## Clarifying question — Doctor 2 asks Clair

Before recording, Doctor 2 asks the chat:

> *"Why was her blood pressure medication stopped?"*

Clair answers from Visit 1: she got dizzy and fell when standing up; the new pill she started three weeks ago is the most likely cause.

---

## Visit 2 — Doctor 2 follow-up

> **Doctor 2:** Eleanor, how are you feeling?
>
> **E:** Better. The confusion's gone. Just a little dizzy if I get up too fast.
>
> **Doctor 2:** That's great to hear, Eleanor. Your blood pressure's looking much better when you stand now — really good sign. Your head scan came back clean, no bleeding. One change I want to make: I'd like you off the ibuprofen for your knees. It can be hard on your kidneys at your age — let's switch you to acetaminophen instead. I'm also going to set you up with at-home physical therapy to work on your balance, and we'll see you back in two weeks.

---

## Doctor 1 comes back — "What's Changed"

Doctor 1 reopens Eleanor's chart. The diff lights up:

- **Patient says** — "Felt dizzy, fell" → "Better. Confusion gone. Mild dizziness on quick stand."
- **Medications** — `− Ibuprofen` / `+ Acetaminophen`
- **Vitals** — Standing blood pressure: 102/64 → 118/70 (improved).
- **Plan** — `+ At-home physical therapy` / `+ Follow-up in 2 weeks` / `+ Avoid ibuprofen (kidneys)`

A 1-sentence summary at the top: "Eleanor is improving since stopping the new blood pressure medication. Pain reliever swapped for a kidney-safe one. Physical therapy and a 2-week follow-up added."
