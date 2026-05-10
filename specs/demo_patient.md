# Demo Patient — Matthew Traynam

A fictional patient designed to walk a non-clinical audience through every feature of the system in 5 minutes. The story is intentionally **light** — Matthew is going to be fine — but it has enough moving parts to show *why* doctor handoffs are risky and *why* this system helps.

---

## 1. The story in plain language

**Matthew Traynam** is a 52-year-old man admitted to the hospital with **pneumonia** — a common, treatable lung infection. He also has **type 2 diabetes** that he normally manages at home with a pill (metformin), but because he's sick, his blood sugars are running high in the hospital, so the team is giving him insulin until he gets better.

He'll go home in a few days. Nothing here is life-threatening.

But across his stay, **multiple doctors take care of him on different shifts**. Each shift has its own handoff. The danger isn't the pneumonia — it's the *handoff*. A small miscommunication between two doctors about an insulin dose, or a forgotten detail about an allergy, can turn a routine admission into a problem.

That's the demo: a routine case where the *system* catches the kind of small misunderstanding that, in real hospitals, sometimes slips through.

---

## 2. Why every piece of the flow exists (high level)

Use this as your pitch outline. Each feature exists to address a specific pain point.

| Feature | Pain point it addresses |
|---|---|
| **Source-of-truth record per patient** | Today, patient info lives in a doctor's head and scattered notes. We make it explicit and structured. |
| **Auto-update from visit transcripts** | Doctors hate writing notes. We listen to the visit and update the record automatically. |
| **Per-doctor "what's changed" diff** | When you walk back into a room, you don't know what happened while you were off shift. We show you exactly that. |
| **Document upload + chatbot** | Patients arrive with paper records. We let them upload, and a doctor can ask questions across the whole history. |
| **Handoff session with live agenda** | Verbal handoffs are unstructured. We auto-generate the topics that need to be covered based on what's *actually changed*. |
| **Discrepancy detection during handoff** | If Doctor A *says* a number that doesn't match what's in the record, we flag it in real time. The system doesn't judge the medicine — it just compares words to data. |

---

## 3. Patient profile

| Field | Value |
|---|---|
| **Name** | Matthew Traynam |
| **DOB** | 1972-08-22 (age 52) |
| **Sex** | Male |
| **Height** | 178 cm (5'10") |
| **Weight** | 86 kg (190 lbs) |
| **MRN** | MT-2026-0301 |
| **Address** | 1518 Russell Blvd, Davis, CA 95616 |
| **Phone** | (530) 555-0167 |
| **Emergency contact** | Sarah Traynam (wife) — (530) 555-0168 |
| **Primary care provider** | Dr. Linh Tran, Davis Family Medicine |

### Past medical history
- Type 2 diabetes (diagnosed 2018, managed with metformin)
- High blood pressure (diagnosed 2020, managed with lisinopril)
- Kidney stone (passed naturally, hospitalized briefly 2 months ago)

### Allergies
- **Penicillin** — gives him a rash. *This matters because pneumonia is usually treated with penicillin-family antibiotics; the team has to use an alternative.*

### Social
- Works as a high school history teacher
- Married, two teenage kids
- Never smoker, occasional beer
- Generally healthy and active — runs a few times a week

---

## 4. The demo timeline

A natural arc with two visits and one handoff. Each step exercises a feature.

### Two months ago — Prior admission (creates the discharge summary)
Came to the ER with severe flank pain. Diagnosed with a kidney stone, passed it overnight, discharged the next day. Routine. *This visit produces the discharge summary document* — useful for the chatbot demo because it shows that prior history is captured.

### Today — Day 1: Admission
Matthew shows up at the ER with three days of cough, fever, and shortness of breath. Chest X-ray shows pneumonia in the right lung. Admitted for IV antibiotics.

**Visit 1 — Dr. Patel (admitting doctor):**
- Confirms pneumonia
- Starts him on a non-penicillin antibiotic (because of his allergy)
- Notices his blood sugars are running high (around 220 mg/dL) — sickness is making his diabetes harder to control
- Starts him on a small insulin dose (**6 units of long-acting insulin at bedtime**)
- Plan: continue antibiotics for a week, monitor sugars, expect to discharge in 3-4 days

### Today — Day 2: The handoff (the centerpiece of the demo)
Dr. Patel finishes her shift. **Dr. Chen** takes over. They do a verbal handoff at the patient's room.

**The system has already prepared an agenda** — pulled from what changed since Dr. Chen last saw the patient:
- New diagnosis: pneumonia
- New medications: antibiotic + insulin
- Allergy reminder: penicillin
- Vitals trend: fever broke overnight, oxygen levels stable
- Pending: nothing critical, just continued monitoring

**The discrepancy moment** — this is what sells the demo:

While walking through the handoff, Dr. Patel says: *"...and we've got him on **sixteen units** of insulin at bedtime."*

But the record shows **6 units**.

The system flags this in real time:
> ⚠️ *Stated: insulin 16 units | Record shows: insulin 6 units*

Dr. Chen catches it. They check, confirm the actual dose is 6, and move on. **Without this catch, Dr. Chen might have ordered 16 units that night** — a dose almost three times higher than what's actually right, which would drop Matthew's blood sugar dangerously low overnight.

**The point**: The system isn't judging the medicine. It's not saying "16 units is wrong." It's just doing a literal comparison: *"You said sixteen. The record says six. Confirm?"* That's the data-anchored discrepancy detection — the LLM only extracted a number from the spoken sentence; the actual judgment is just `if stated_value != record_value`.

### Day 3-4 — Discharge
Pneumonia improves, antibiotics continue at home, insulin discontinued as sugars normalize, discharged home. Outside the demo scope — we just need to show what's been built up by then.

---

## 5. Source of truth (initial state at admission today)

This is what the patient record looks like *before* Dr. Patel's first visit, used to seed the demo.

```json
{
  "long_term_goals": "Maintain functional independence; manage chronic conditions (diabetes, hypertension); patient is otherwise healthy and active.",
  "active_diagnoses": [
    { "condition": "Type 2 diabetes mellitus", "since": "2018", "notes": "On metformin, A1C 7.1 at last check" },
    { "condition": "Hypertension", "since": "2020", "notes": "Well-controlled on lisinopril" }
  ],
  "current_medications": [
    { "name": "Metformin", "dose": "1000 mg", "frequency": "twice daily with meals", "started_at": "2018" },
    { "name": "Lisinopril", "dose": "10 mg", "frequency": "once daily", "started_at": "2020" }
  ],
  "recent_vitals": {
    "bp": "132/82",
    "hr": 96,
    "temp_c": 38.6,
    "o2_sat": 93,
    "taken_at": "ED triage, today 09:40"
  },
  "treatment_plan": "Admitted from ED for community-acquired pneumonia. Workup in progress."
}
```

After **Dr. Patel's Visit 1**, the record updates to include the new antibiotic, the insulin (6 units), and pneumonia as an active diagnosis. After **Dr. Chen's handoff**, both doctors' snapshots are aligned with that updated record.

---

## 6. How to fill out the documents (high-level reasoning)

You have three documents to "fill out" for Matthew. Don't overthink the medical content — what matters is *why* each one exists in the demo.

### 6a. CBC report (the lab PDF you uploaded)

**Why it's in the demo**: A blood test is one of the first things ordered when someone comes in with an infection. It shows whether the body is fighting something.

**What to fill in**:
- Patient name: TRAYNAM, MATTHEW
- DOB: 1972-08-22
- MRN: MT-2026-0301
- Ordering physician: Dr. Anjali Patel
- Collected: today's date, around 10:00

**What the values would show** (for a pneumonia case):
- White blood cell count: **slightly elevated** — the body is fighting infection
- Hemoglobin, platelets: **normal**
- No alarming findings

You don't need to change the actual numbers on the PDF for the demo — just be ready to say *"this is Matthew's CBC, white count is up because he's fighting the pneumonia, everything else looks normal."*

### 6b. Discharge summary (the NHS template you uploaded)

**Why it's in the demo**: This is from his **prior admission two months ago** for the kidney stone. It's a great example of "prior history a new doctor wouldn't otherwise know about." The chatbot can pull from it later.

**What to fill in** (just the highlights — you don't need to fill every field):
- Patient: Traynam, Matthew / DOB 1972-08-22
- Admission date: ~2 months ago
- Discharge date: 1 day later
- Diagnosis at discharge: **Acute kidney stone (passed)**
- Reason for admission: severe right-sided flank pain, vomiting; CT confirmed kidney stone
- Clinical narrative: Treated with IV fluids and pain medication overnight. Stone passed spontaneously. Discharged home with hydration instructions and a follow-up.
- Discharge medications: continue home meds (metformin, lisinopril)
- Allergies: **Penicillin (rash)** — this is critical, comes up again at the current admission
- Discharge destination: home

### 6c. MyMedications List (the CDC patient form)

**Why it's in the demo**: This is what Matthew brought with him to the hospital. It's the patient's own list of what he takes. Think of it as the "this is what the patient claims" — a useful cross-reference for the team.

**What to fill in** (just the relevant cells):

**My Information**
- Name: Matthew Traynam
- DOB: 08/22/1972
- Phone: (530) 555-0167
- Emergency contact: Sarah Traynam — (530) 555-0168 — Wife

**My Health Care Providers**
- Primary care: Dr. Linh Tran — (530) 555-2200
- Pharmacist: Davis Community Pharmacy — (530) 555-7700

**My Medical Conditions**
| Condition | Date diagnosed |
|---|---|
| Type 2 diabetes | 04/2018 |
| High blood pressure | 09/2020 |
| Kidney stone (resolved) | 01/2026 |

**Medications I don't use because of allergies**
| Medication | Reason |
|---|---|
| Penicillin | Rash all over body, 2010 |

**My current medications**
| Name | Reason | Dose | Provider | Notes |
|---|---|---|---|---|
| Metformin | Diabetes | 1000 mg twice daily with meals | Dr. Tran | Take with food |
| Lisinopril | Blood pressure | 10 mg once daily, morning | Dr. Tran | Started 2020 |
| Ibuprofen | Occasional headaches | 400 mg as needed | OTC | Rarely use |

---

## 7. What the chatbot should be able to answer

If everything above is uploaded and the visits are recorded, the chatbot should be able to answer these — pulling from documents and transcripts:

- *"What is Matthew allergic to?"* → Penicillin (causes rash)
- *"Has he been hospitalized before?"* → Yes, kidney stone two months ago
- *"What insulin dose is he on?"* → 6 units at bedtime
- *"What medications does he take at home?"* → Metformin, lisinopril
- *"Why did the team avoid penicillin?"* → He has a documented penicillin allergy
- *"Who is his emergency contact?"* → Sarah Traynam, his wife

These questions show that the chatbot reaches across **uploaded patient documents** *and* **visit transcripts** — both contribute to the answer.

---

## 8. The 5-minute demo script

Use this verbatim if you want.

1. *"This is Matthew Traynam, a 52-year-old admitted with pneumonia. He's also diabetic, which is making his blood sugars hard to control while he's sick."*
2. **Login as Dr. Patel.** Open Matthew's record. *"He's brand new — first time we're seeing him."* Show the document upload — discharge summary, medication list. *"He brought these with him. They go straight into the chatbot's knowledge."*
3. **Start visit (Dr. Patel).** Speak the Visit 1 summary out loud: *"Matthew has community-acquired pneumonia. Starting him on a non-penicillin antibiotic because of his allergy. Sugars are running high — starting 6 units of insulin at bedtime."* End visit. *"The system extracted the new diagnosis, the new meds, and updated the record."*
4. **Logout. Login as Dr. Chen.** Open Matthew's record. *"Dr. Chen has never seen this patient. Look — the system shows everything that's changed."*
5. **Initiate handoff** with Dr. Patel. *"The system already knows what topics need to be covered."* Show the auto-generated agenda.
6. **Speak the handoff** — and **say "sixteen units" instead of six.** *"Watch what happens."*
7. **The flag appears.** *"The record says 6 units. Dr. Patel said 16. The system isn't deciding whether 16 is right or wrong — it's just comparing the words to the data. This is the kind of small mistake that, in real handoffs, can put a patient in the ICU. We caught it in real time."*
8. **Open the chatbot.** Ask: *"What's his allergy?"* and *"Has he been admitted before?"* — answers come from the uploaded documents *and* the visit transcripts.

That's the pitch.

---

## 9. Notes

- Patient name and MRN are consistent across all documents — use these exact values when seeding.
- Set "current admission" to today's date when running the demo, "kidney stone admission" to ~2 months prior.
- The CBC PDF can be left as-is — for the pitch, just describe what the values *would* show. Editing the PDF is optional polish.
