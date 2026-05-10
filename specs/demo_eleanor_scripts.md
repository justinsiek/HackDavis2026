# Eleanor Brooks — 2-Minute Demo Scripts

Two short visit scripts (~25s spoken each) for a 2-minute end-to-end demo. The flow:

1. **Dr. Patel** admits Eleanor → records Visit 1 → generates admission note.
2. **Dr. Chen** opens Eleanor's record → asks Clair a clarifying question → records Visit 2.
3. **Dr. Patel** returns → "What's changed" surfaces real, meaningful deltas.

Cast: **Dr. P** (Patel), **Dr. C** (Chen), **E** (Eleanor, 78F), **D** (daughter).

---

## Visit 1 — Dr. Patel admits Eleanor

> **Dr. P:** Eleanor, what happened this morning?
>
> **E:** I stood up from the couch, got real dizzy, and went down on the right side of my head.
>
> **D:** Her PCP started her on lisinopril three weeks ago. She's also on hydrochlorothiazide and metformin. She uses ibuprofen for her knees.
>
> **Dr. P:** Orthostatics — lying 142 over 84, standing 102 over 64. That's a real drop. Plan: hold the lisinopril and the HCTZ, IV fluids, head CT to rule out a bleed. Daughter-supervised tonight.

→ Generate admission note from this visit.

---

## Clarifying question — Dr. Chen asks Clair

Before recording, Dr. Chen asks the chat:

> *"Why was lisinopril held?"*

Clair answers from Visit 1's transcript and the patient state: orthostatic hypotension on standing, started lisinopril 3 weeks prior — likely contributor.

---

## Visit 2 — Dr. Chen follow-up

> **Dr. C:** Eleanor, how are you feeling?
>
> **E:** Better. Confusion's gone. Still a little dizzy if I stand up too fast.
>
> **Dr. C:** Orthostatics improving — lying 138 over 80, standing 118 over 70. CT was clean, just a small right temporal subgaleal hematoma, no bleed. With her CKD, I'm stopping the ibuprofen — switch to acetaminophen. Starting home PT for balance. Follow-up in two weeks.

---

## Dr. Patel returns — "What's changed"

When Dr. Patel reopens Eleanor, the diff surfaces:

- **Subjective** — "Felt dizzy on standing, fell" → "Better. Confusion gone. Mild dizziness on quick stand."
- **Medications** — `− Ibuprofen PRN` / `+ Acetaminophen PRN`
- **Vitals** — Lying BP 142/84 → 138/80; standing 102/64 → 118/70.
- **Plan** — `+ Home PT for balance` / `+ Follow-up in 2 weeks` / `+ No NSAIDs (CKD)`

Plus a 1-sentence summary at the top from Clair: "Symptoms improving on held antihypertensives; ibuprofen swapped for acetaminophen given CKD; home PT and 2-week follow-up added."
