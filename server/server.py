import json
import os
from datetime import datetime, timezone

import anthropic
import httpx
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
LLM_MODEL = "claude-sonnet-4-6"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
anthropic_client = (
    anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
)

app = Flask(__name__)
CORS(app, allow_headers=["Content-Type", "X-Doctor-Username"])


def db_call(fn, *args, **kwargs):
    """Run a Supabase call, retrying once on a stale HTTP/2 connection."""
    try:
        return fn(*args, **kwargs)
    except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError):
        return fn(*args, **kwargs)


STATE_FIELDS = [
    "synopsis",
    "current_presentation",
    "active_diagnoses",
    "current_medications",
    "treatment_plan",
    "recent_vitals",
    "long_term_goals",
]


def state_subset(state):
    """Pull just the structured medical fields out of a patient_state row."""
    if not state:
        return {
            "synopsis": "",
            "current_presentation": "",
            "active_diagnoses": [],
            "current_medications": [],
            "treatment_plan": "",
            "recent_vitals": None,
            "long_term_goals": "",
        }
    return {
        "synopsis": state.get("synopsis") or "",
        "current_presentation": state.get("current_presentation") or "",
        "active_diagnoses": state.get("active_diagnoses") or [],
        "current_medications": state.get("current_medications") or [],
        "treatment_plan": state.get("treatment_plan") or "",
        "recent_vitals": state.get("recent_vitals"),
        "long_term_goals": state.get("long_term_goals") or "",
    }


UPDATE_PATIENT_STATE_TOOL = {
    "name": "update_patient_state",
    "description": (
        "Return the patient's structured medical record updated based on the new "
        "visit transcript. Carry forward unchanged fields verbatim. Do not invent "
        "vitals, medications, diagnoses, or history that aren't mentioned."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "synopsis": {
                "type": "string",
                "description": (
                    "ONE sentence in standard clinical format: "
                    "'[age]yo [sex], [key hx], p/w [chief complaint].' "
                    "≤25 words. Empty if not enough info."
                ),
            },
            "current_presentation": {
                "type": "string",
                "description": (
                    "Patient's subjective account this visit, in 1-2 short sentences. "
                    "Clinical shorthand OK. ≤40 words. Empty if nothing reported."
                ),
            },
            "active_diagnoses": {
                "type": "array",
                "description": "Conditions currently being treated.",
                "items": {
                    "type": "object",
                    "properties": {
                        "condition": {"type": "string", "description": "Condition name only, no extras."},
                        "since": {"type": "string", "description": "When first noted (e.g. '2024', '3 days ago'). Empty if unknown."},
                        "notes": {"type": "string", "description": "≤10 words of clinical detail. Empty if none."},
                    },
                    "required": ["condition", "since", "notes"],
                },
            },
            "current_medications": {
                "type": "array",
                "description": "Active prescriptions.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "dose": {"type": "string"},
                        "frequency": {"type": "string"},
                    },
                    "required": ["name", "dose", "frequency"],
                },
            },
            "treatment_plan": {
                "type": "string",
                "description": (
                    "Plan & next steps as terse fragments separated by '; '. "
                    "Action-oriented, no filler. ≤40 words. Empty if none."
                ),
            },
            "recent_vitals": {
                "type": ["object", "null"],
                "description": "Most recent vitals mentioned. Null if none known.",
                "properties": {
                    "bp": {"type": "string"},
                    "hr": {"type": "string"},
                    "temp_c": {"type": "string"},
                    "o2_sat": {"type": "string"},
                    "taken_at": {"type": "string"},
                },
            },
            "long_term_goals": {
                "type": "string",
                "description": (
                    "Forward-looking goals as a single short sentence or "
                    "comma-separated targets. ≤25 words. Empty if none."
                ),
            },
            "plan_items": {
                "type": "array",
                "description": (
                    "NEW structured plan/next-step items the doctor articulated this "
                    "visit. Append-only: do NOT re-emit items already in "
                    "EXISTING_PLAN_ITEMS — those are still in effect. Emit each item "
                    "ONCE, terse and action-oriented (≤12 words). Do not duplicate "
                    "what's already captured in current_medications. Empty array if "
                    "the transcript adds nothing new."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": [
                                "URGENT",
                                "Follow-up",
                                "Tests/Labs",
                                "Medication",
                                "Monitoring",
                                "Lifestyle",
                            ],
                            "description": (
                                "URGENT = immediate/safety-critical action; "
                                "Follow-up = appointments, re-checks, callbacks; "
                                "Tests/Labs = labs/imaging to order or review; "
                                "Medication = new Rx, dose change, taper, stop; "
                                "Monitoring = vitals/symptoms to watch; "
                                "Lifestyle = diet, exercise, behavior counseling."
                            ),
                        },
                        "text": {
                            "type": "string",
                            "description": "≤12 words, action-oriented fragment.",
                        },
                    },
                    "required": ["category", "text"],
                },
            },
        },
        "required": [
            "synopsis",
            "current_presentation",
            "active_diagnoses",
            "current_medications",
            "treatment_plan",
            "recent_vitals",
            "long_term_goals",
            "plan_items",
        ],
    },
}


def extract_patient_state(current_state, transcript, existing_plan_items=None):
    """
    Run the unified extractor.

    Returns a tuple `(state, plan_items)`:
      - `state`   — dict with the keys in STATE_FIELDS (writable to patient_state).
      - `plan_items` — list of {category, text} dicts of NEW plan items the
        doctor articulated this visit (caller is responsible for inserting
        them into patient_plan_items, append-only).

    `existing_plan_items` is passed to the model so it doesn't re-emit items
    already on the patient's plan.
    """
    base = state_subset(current_state)
    if not anthropic_client or not transcript.strip():
        return base, []
    existing_for_prompt = [
        {"category": p.get("category"), "text": p.get("text")}
        for p in (existing_plan_items or [])
        if not p.get("done")
    ]
    response = anthropic_client.messages.create(
        model=LLM_MODEL,
        max_tokens=2000,
        system=(
            "You are a clinical scribe. Update the patient's record based on a new "
            "visit transcript using the update_patient_state tool.\n\n"
            "BREVITY IS CRITICAL. Every text field is read at a glance by a busy "
            "clinician. Use clinical shorthand, fragments separated by '; ', and "
            "comma-separated lists. NEVER write paragraphs. NEVER pad with filler "
            "phrases like 'the patient is' or 'it appears that'. Cut every word that "
            "isn't load-bearing. Per-field word limits in the schema are hard caps.\n\n"
            "Carry forward unchanged fields verbatim. Only modify fields the transcript "
            "clearly addresses. Do NOT invent vitals, medications, diagnoses, or "
            "history that aren't explicitly mentioned. Empty string / empty array / "
            "null for fields with no information.\n\n"
            "PLAN ITEMS are append-only. Re-read EXISTING_PLAN_ITEMS carefully and "
            "do NOT emit anything that's already covered there — those items are "
            "still in effect. Only emit genuinely new actions the doctor decided "
            "this visit."
        ),
        tools=[UPDATE_PATIENT_STATE_TOOL],
        tool_choice={"type": "tool", "name": "update_patient_state"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"CURRENT_STATE:\n{json.dumps(base, indent=2)}\n\n"
                    f"EXISTING_PLAN_ITEMS:\n{json.dumps(existing_for_prompt, indent=2)}\n\n"
                    f"TRANSCRIPT:\n{transcript}"
                ),
            }
        ],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "update_patient_state":
            output = block.input or {}
            plan_items = output.pop("plan_items", []) or []
            return output, plan_items
    return base, []


def summarize_visit(transcript):
    """Generate a 1-2 sentence summary of a visit transcript."""
    if not anthropic_client or not transcript.strip():
        return ""
    response = anthropic_client.messages.create(
        model=LLM_MODEL,
        max_tokens=120,
        system=(
            "Summarize this doctor-patient visit in 1-2 short sentences focused "
            "on what was discussed and what was decided. Use clinical shorthand. "
            "≤30 words. No preamble, no markdown, just the summary."
        ),
        messages=[{"role": "user", "content": f"TRANSCRIPT:\n{transcript}"}],
    )
    return response.content[0].text.strip()


def draft_visit_note(transcript):
    """Generate a SOAP-format clinical note from a visit transcript."""
    if not anthropic_client or not transcript.strip():
        return ""
    response = anthropic_client.messages.create(
        model=LLM_MODEL,
        max_tokens=800,
        system=(
            "You are a clinical scribe drafting a chart note from a doctor-patient "
            "visit transcript. Produce a SOAP-format note with the four sections "
            "exactly as headers in this order:\n\n"
            "SUBJECTIVE\nOBJECTIVE\nASSESSMENT\nPLAN\n\n"
            "Each section should be terse and clinical — fragments OK, clinical "
            "shorthand encouraged. Use bullet-style lines (one fact per line) where "
            "natural; otherwise short sentences. Do NOT invent findings, vitals, or "
            "diagnoses not in the transcript. If a section has no content from the "
            "transcript, write a single line: 'Not documented.' Output the note "
            "only — no preamble, no markdown formatting beyond the four headers."
        ),
        messages=[{"role": "user", "content": f"TRANSCRIPT:\n{transcript}"}],
    )
    return response.content[0].text.strip()


def _fmt_med(m):
    if not isinstance(m, dict):
        return str(m)
    parts = [m.get("name") or "", m.get("dose") or "", m.get("frequency") or ""]
    return " ".join(p for p in parts if p).strip()


def _fmt_dx(d):
    if not isinstance(d, dict):
        return str(d)
    cond = d.get("condition") or ""
    pieces = [cond]
    if d.get("since"):
        pieces.append(f"({d['since']})")
    if d.get("notes"):
        pieces.append(f"— {d['notes']}")
    return " ".join(p for p in pieces if p).strip()


def _diff_text(before, after):
    b = (before or "").strip()
    a = (after or "").strip()
    if b == a:
        return None
    return {"before": before or "", "after": after or ""}


def _diff_list(before, after, key_fn, fmt_fn):
    before = before or []
    after = after or []
    by_key_before = {key_fn(x): x for x in before}
    by_key_after = {key_fn(x): x for x in after}
    added = [fmt_fn(by_key_after[k]) for k in by_key_after if k not in by_key_before]
    removed = [fmt_fn(by_key_before[k]) for k in by_key_before if k not in by_key_after]
    modified = []
    for k, v_before in by_key_before.items():
        if k in by_key_after and by_key_after[k] != v_before:
            modified.append({"before": fmt_fn(v_before), "after": fmt_fn(by_key_after[k])})
    return added, removed, modified


def _diff_vitals(before, after):
    before = before or {}
    after = after or {}
    keys = [("bp", "BP"), ("hr", "HR"), ("temp_c", "Temp"), ("o2_sat", "SpO₂")]
    changes = []
    for key, label in keys:
        b = (before.get(key) or "").strip() if isinstance(before.get(key), str) else before.get(key)
        a = (after.get(key) or "").strip() if isinstance(after.get(key), str) else after.get(key)
        if (b or "") != (a or ""):
            changes.append({"key": label, "before": b or "", "after": a or ""})
    return changes


def build_field_diffs(snapshot, current_state):
    """Deterministically compute per-field diffs between a doctor's snapshot and current state."""
    snap = state_subset(snapshot)
    cur = state_subset(current_state)
    diffs = []

    for key, label in [
        ("synopsis", "Synopsis"),
        ("current_presentation", "Subjective"),
        ("treatment_plan", "Plan"),
        ("long_term_goals", "Long-term goals"),
    ]:
        d = _diff_text(snap.get(key), cur.get(key))
        if d:
            diffs.append({"field": key, "label": label, "kind": "text", **d})

    a, r, m = _diff_list(
        snap.get("active_diagnoses"),
        cur.get("active_diagnoses"),
        lambda x: (x.get("condition") or "").strip().lower(),
        _fmt_dx,
    )
    if a or r or m:
        diffs.append({
            "field": "active_diagnoses",
            "label": "Active problems",
            "kind": "list",
            "added": a, "removed": r, "modified": m,
        })

    a, r, m = _diff_list(
        snap.get("current_medications"),
        cur.get("current_medications"),
        lambda x: (x.get("name") or "").strip().lower(),
        _fmt_med,
    )
    if a or r or m:
        diffs.append({
            "field": "current_medications",
            "label": "Medications",
            "kind": "list",
            "added": a, "removed": r, "modified": m,
        })

    v = _diff_vitals(snap.get("recent_vitals"), cur.get("recent_vitals"))
    if v:
        diffs.append({
            "field": "recent_vitals",
            "label": "Vitals",
            "kind": "vitals",
            "changes": v,
        })

    return diffs


def summarize_changes(field_diffs):
    """Ask Claude for a short prose TL;DR over the structured diffs."""
    if not field_diffs or not anthropic_client:
        return ""
    response = anthropic_client.messages.create(
        model=LLM_MODEL,
        max_tokens=200,
        system=(
            "You write a short clinical handoff summary — 1 to 3 sentences — for a "
            "doctor about what's changed in their patient since they last viewed "
            "the chart. Use clinical shorthand and concrete values. Lead with what "
            "matters most clinically. Flowing prose, no bullets, no preamble, no "
            "headers, no second-person framing."
        ),
        messages=[
            {
                "role": "user",
                "content": f"CHANGES:\n{json.dumps(field_diffs, indent=2, default=str)}",
            }
        ],
    )
    return response.content[0].text.strip()


def get_doctor_by_username(username):
    if not username:
        return None
    result = db_call(
        supabase.table("doctors")
        .select("id, username, name")
        .eq("username", username)
        .limit(1)
        .execute
    )
    return result.data[0] if result.data else None


def require_doctor():
    username = request.headers.get("X-Doctor-Username")
    doctor = get_doctor_by_username(username)
    if not doctor:
        return None, (jsonify({"error": "unauthorized"}), 401)
    return doctor, None


@app.route("/api/health", methods=["GET"])
def health():
    try:
        result = db_call(
            supabase.table("doctors").select("id", count="exact").limit(1).execute
        )
        return jsonify({"ok": True, "doctors_count": result.count}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    doctor = get_doctor_by_username(username)
    if not doctor:
        return jsonify({"error": "unknown user"}), 401
    return jsonify({"doctor": doctor})


@app.route("/api/patients", methods=["GET"])
def list_patients():
    doctor, err = require_doctor()
    if err:
        return err
    result = db_call(
        supabase.table("patients")
        .select("id, name, dob, sex, height_cm, weight_kg, photo_data, admitted_at")
        .order("admitted_at", desc=True)
        .execute
    )
    patients = result.data or []
    if not patients:
        return jsonify({"patients": []})

    states = db_call(
        supabase.table("patient_state")
        .select("patient_id, updated_at, updated_by_visit_id")
        .execute
    )
    state_by_id = {s["patient_id"]: s for s in (states.data or [])}

    snaps = db_call(
        supabase.table("doctor_patient_snapshots")
        .select("patient_id, snapshot_at")
        .eq("doctor_id", doctor["id"])
        .execute
    )
    snap_by_id = {s["patient_id"]: s["snapshot_at"] for s in (snaps.data or [])}

    for p in patients:
        state = state_by_id.get(p["id"])
        snap_at = snap_by_id.get(p["id"])
        # Only flag as "new" if THIS doctor has previously engaged (has a snapshot)
        # AND the patient state has been updated since their snapshot.
        if not state or not snap_at or not state.get("updated_by_visit_id"):
            p["has_new_updates"] = False
        else:
            p["has_new_updates"] = state["updated_at"] > snap_at

    return jsonify({"patients": patients})


@app.route("/api/patients", methods=["POST"])
def admit_patient():
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    payload = {
        "name": name,
        "dob": body.get("dob") or None,
        "sex": body.get("sex") or None,
        "height_cm": body.get("height_cm"),
        "weight_kg": body.get("weight_kg"),
        "photo_data": body.get("photo_data") or None,
        "admitted_by": doctor["id"],
    }
    inserted = db_call(supabase.table("patients").insert(payload).execute)
    if not inserted.data:
        return jsonify({"error": "insert failed"}), 500
    patient = inserted.data[0]
    db_call(
        supabase.table("patient_state").insert({"patient_id": patient["id"]}).execute
    )
    return jsonify({"patient": patient}), 201


@app.route("/api/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    _, err = require_doctor()
    if err:
        return err
    db_call(
        supabase.table("patients").delete().eq("id", patient_id).execute
    )
    return jsonify({"ok": True})


@app.route("/api/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    doctor, err = require_doctor()
    if err:
        return err

    p_result = db_call(
        supabase.table("patients").select("*").eq("id", patient_id).limit(1).execute
    )
    if not p_result.data:
        return jsonify({"error": "not found"}), 404
    patient = p_result.data[0]

    s_result = db_call(
        supabase.table("patient_state")
        .select("*")
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    current_state = s_result.data[0] if s_result.data else None

    snap_result = db_call(
        supabase.table("doctor_patient_snapshots")
        .select("*")
        .eq("doctor_id", doctor["id"])
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    viewer_snapshot = snap_result.data[0] if snap_result.data else None

    is_first_view = viewer_snapshot is None
    narrative = None
    field_diffs: list = []
    if not is_first_view and current_state:
        snap_at = viewer_snapshot.get("snapshot_at")
        cur_at = current_state.get("updated_at")
        if snap_at and cur_at and snap_at < cur_at:
            field_diffs = build_field_diffs(
                viewer_snapshot.get("snapshot") or {}, current_state
            )
            if field_diffs:
                narrative = summarize_changes(field_diffs)

    docs_result = db_call(
        supabase.table("patient_documents")
        .select("id, filename, mime_type, uploaded_at, uploaded_by")
        .eq("patient_id", patient_id)
        .order("uploaded_at", desc=True)
        .execute
    )

    visits_result = db_call(
        supabase.table("visits")
        .select("id, doctor_id, started_at, ended_at, status, transcript, summary")
        .eq("patient_id", patient_id)
        .eq("status", "complete")
        .order("started_at", desc=True)
        .execute
    )
    visits = visits_result.data or []

    plan_items_result = db_call(
        supabase.table("patient_plan_items")
        .select(
            "id, category, text, done, created_at, created_by, "
            "created_during_visit_id, updated_at"
        )
        .eq("patient_id", patient_id)
        .order("created_at", desc=False)
        .execute
    )
    plan_items = plan_items_result.data or []

    if visits:
        doctor_ids = list({v["doctor_id"] for v in visits})
        doctors_result = db_call(
            supabase.table("doctors")
            .select("id, name")
            .in_("id", doctor_ids)
            .execute
        )
        name_by_id = {d["id"]: d["name"] for d in (doctors_result.data or [])}
        for v in visits:
            v["doctor_name"] = name_by_id.get(v["doctor_id"], "Unknown")

    return jsonify({
        "patient": patient,
        "current_state": current_state,
        "viewer_snapshot": viewer_snapshot,
        "narrative": narrative,
        "field_diffs": field_diffs,
        "is_first_view": is_first_view,
        "documents": docs_result.data or [],
        "visits": visits,
        "plan_items": plan_items,
    })


@app.route("/api/patients/<patient_id>/documents", methods=["POST"])
def upload_document(patient_id):
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    filename = (body.get("filename") or "").strip()
    file_data = body.get("file_data")
    mime_type = body.get("mime_type")
    if not filename or not file_data:
        return jsonify({"error": "filename and file_data required"}), 400
    inserted = db_call(
        supabase.table("patient_documents")
        .insert({
            "patient_id": patient_id,
            "filename": filename,
            "mime_type": mime_type,
            "file_data": file_data,
            "uploaded_by": doctor["id"],
        })
        .execute
    )
    if not inserted.data:
        return jsonify({"error": "insert failed"}), 500
    row = inserted.data[0]
    return jsonify({
        "document": {
            "id": row["id"],
            "filename": row["filename"],
            "mime_type": row.get("mime_type"),
            "uploaded_at": row["uploaded_at"],
            "uploaded_by": row.get("uploaded_by"),
        }
    }), 201


@app.route("/api/patients/<patient_id>/documents/<doc_id>", methods=["GET"])
def get_document(patient_id, doc_id):
    _, err = require_doctor()
    if err:
        return err
    result = db_call(
        supabase.table("patient_documents")
        .select("*")
        .eq("id", doc_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    if not result.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"document": result.data[0]})


@app.route("/api/patients/<patient_id>/documents/<doc_id>", methods=["DELETE"])
def delete_document(patient_id, doc_id):
    _, err = require_doctor()
    if err:
        return err
    db_call(
        supabase.table("patient_documents")
        .delete()
        .eq("id", doc_id)
        .eq("patient_id", patient_id)
        .execute
    )
    return jsonify({"ok": True})


PLAN_ITEM_CATEGORIES = {
    "URGENT",
    "Follow-up",
    "Tests/Labs",
    "Medication",
    "Monitoring",
    "Lifestyle",
}


@app.route("/api/patients/<patient_id>/plan-items", methods=["POST"])
def create_plan_item(patient_id):
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    category = (body.get("category") or "").strip()
    text = (body.get("text") or "").strip()
    if category not in PLAN_ITEM_CATEGORIES:
        return jsonify({"error": f"category must be one of {sorted(PLAN_ITEM_CATEGORIES)}"}), 400
    if not text:
        return jsonify({"error": "text is required"}), 400
    inserted = db_call(
        supabase.table("patient_plan_items")
        .insert({
            "patient_id": patient_id,
            "category": category,
            "text": text,
            "created_by": doctor["id"],
        })
        .execute
    )
    if not inserted.data:
        return jsonify({"error": "insert failed"}), 500
    return jsonify({"plan_item": inserted.data[0]})


@app.route("/api/patients/<patient_id>/plan-items/<item_id>", methods=["PATCH"])
def update_plan_item(patient_id, item_id):
    _, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    payload = {}
    if "category" in body:
        category = (body.get("category") or "").strip()
        if category not in PLAN_ITEM_CATEGORIES:
            return jsonify({"error": f"category must be one of {sorted(PLAN_ITEM_CATEGORIES)}"}), 400
        payload["category"] = category
    if "text" in body:
        text = (body.get("text") or "").strip()
        if not text:
            return jsonify({"error": "text cannot be empty"}), 400
        payload["text"] = text
    if "done" in body:
        payload["done"] = bool(body.get("done"))
    if not payload:
        return jsonify({"error": "no updatable fields provided"}), 400
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated = db_call(
        supabase.table("patient_plan_items")
        .update(payload)
        .eq("id", item_id)
        .eq("patient_id", patient_id)
        .execute
    )
    if not updated.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"plan_item": updated.data[0]})


@app.route("/api/patients/<patient_id>/plan-items/<item_id>", methods=["DELETE"])
def delete_plan_item(patient_id, item_id):
    _, err = require_doctor()
    if err:
        return err
    db_call(
        supabase.table("patient_plan_items")
        .delete()
        .eq("id", item_id)
        .eq("patient_id", patient_id)
        .execute
    )
    return jsonify({"ok": True})


@app.route("/api/visits/start", methods=["POST"])
def start_visit():
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    patient_id = body.get("patient_id")
    if not patient_id:
        return jsonify({"error": "patient_id required"}), 400

    visit_insert = db_call(
        supabase.table("visits")
        .insert({
            "patient_id": patient_id,
            "doctor_id": doctor["id"],
            "status": "active",
        })
        .execute
    )
    if not visit_insert.data:
        return jsonify({"error": "could not create visit"}), 500
    visit_id = visit_insert.data[0]["id"]

    return jsonify({"visit_id": visit_id})


@app.route("/api/visits/<visit_id>/note", methods=["POST"])
def generate_visit_note(visit_id):
    _, err = require_doctor()
    if err:
        return err
    visit_row = db_call(
        supabase.table("visits")
        .select("transcript")
        .eq("id", visit_id)
        .limit(1)
        .execute
    )
    if not visit_row.data:
        return jsonify({"error": "visit not found"}), 404
    transcript = visit_row.data[0].get("transcript") or ""
    if not transcript.strip():
        return jsonify({"note": "", "error": "Visit has no transcript."}), 200
    note = draft_visit_note(transcript)
    return jsonify({"note": note})


@app.route("/api/visits/<visit_id>/finalize", methods=["POST"])
def finalize_visit(visit_id):
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    transcript = body.get("transcript", "")
    now_iso = datetime.now(timezone.utc).isoformat()

    visit_summary = summarize_visit(transcript)

    db_call(
        supabase.table("visits")
        .update({
            "transcript": transcript,
            "summary": visit_summary,
            "ended_at": now_iso,
            "status": "complete",
        })
        .eq("id", visit_id)
        .execute
    )

    visit_row = db_call(
        supabase.table("visits")
        .select("patient_id")
        .eq("id", visit_id)
        .limit(1)
        .execute
    )
    if not visit_row.data:
        return jsonify({"error": "visit not found"}), 404
    patient_id = visit_row.data[0]["patient_id"]

    state_row = db_call(
        supabase.table("patient_state")
        .select("*")
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    current_state = state_row.data[0] if state_row.data else {}

    existing_plan = db_call(
        supabase.table("patient_plan_items")
        .select("category, text, done")
        .eq("patient_id", patient_id)
        .execute
    )

    new_state, new_plan_items = extract_patient_state(
        current_state, transcript, existing_plan_items=existing_plan.data or []
    )

    db_call(
        supabase.table("patient_state")
        .update({
            **new_state,
            "updated_at": now_iso,
            "updated_by_visit_id": visit_id,
        })
        .eq("patient_id", patient_id)
        .execute
    )

    # Append-only insert of structured plan items the doctor articulated this
    # visit. Tagged with created_during_visit_id so the UI can show a "from
    # visit" badge and we can trace provenance later.
    rows_to_insert = []
    for item in new_plan_items:
        category = (item.get("category") or "").strip()
        text = (item.get("text") or "").strip()
        if category not in PLAN_ITEM_CATEGORIES or not text:
            continue
        rows_to_insert.append({
            "patient_id": patient_id,
            "category": category,
            "text": text,
            "created_by": doctor["id"],
            "created_during_visit_id": visit_id,
        })
    if rows_to_insert:
        db_call(
            supabase.table("patient_plan_items").insert(rows_to_insert).execute
        )

    db_call(
        supabase.table("doctor_patient_snapshots")
        .upsert({
            "doctor_id": doctor["id"],
            "patient_id": patient_id,
            "snapshot": new_state,
            "snapshot_at": now_iso,
            "last_visit_id": visit_id,
        })
        .execute
    )

    return jsonify({"ok": True, "added_plan_items": len(rows_to_insert)})


# ---------------------------------------------------------------------------
# Chatbot — per-doctor, per-patient assistant grounded in record + documents
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = (
    "You are answering a colleague's questions about ONE patient. Speak like a "
    "doctor talking to another doctor at the bedside — terse, clinical, no "
    "fluff.\n\n"
    "STYLE — non-negotiable:\n"
    "- Plain prose only. NO markdown tables, NO bullet lists, NO bold headers, "
    "  NO numbered sections. Sentences and semicolon-separated fragments only.\n"
    "- ≤2 sentences (or ≤40 words) for most answers. Longer only if the "
    "  question explicitly demands it (e.g. 'walk me through the hospital "
    "  course').\n"
    "- Clinical shorthand is fine: BID, PRN, p/w, hx, IV, etc. Drop filler "
    "  phrases like 'Based on the record,' or 'The patient is currently…'.\n"
    "- Cite the source inline and briefly when relevant: '(per discharge "
    "  summary)', '(visit 2026-05-09)', '(med list)'. No long preambles.\n"
    "- Don't restate the question. Just answer.\n\n"
    "GROUNDING — non-negotiable:\n"
    "- Use ONLY the structured record, prior visit transcripts, and uploaded "
    "  documents provided.\n"
    "- If the answer isn't explicitly there, reply exactly: \"Not in the "
    "  record.\" and stop.\n"
    "- Do not infer, generalize, or fill gaps with clinical knowledge."
)

CHAT_DOC_MIME_DOCUMENT = {"application/pdf"}
CHAT_DOC_MIME_IMAGE = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}


def build_chat_context(patient_id):
    """
    Returns (doc_content_blocks, context_text).
    - doc_content_blocks: Anthropic content blocks for PDFs/images (passed natively).
    - context_text: structured patient record + visit transcripts as text.
    """
    patient_row = db_call(
        supabase.table("patients").select("*").eq("id", patient_id).limit(1).execute
    )
    patient = patient_row.data[0] if patient_row.data else {}

    state_row = db_call(
        supabase.table("patient_state")
        .select("*")
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    state = state_row.data[0] if state_row.data else {}

    plan_row = db_call(
        supabase.table("patient_plan_items")
        .select("category, text, done, created_at, created_during_visit_id")
        .eq("patient_id", patient_id)
        .order("created_at", desc=False)
        .execute
    )
    plan_items = plan_row.data or []

    visits_row = db_call(
        supabase.table("visits")
        .select("id, started_at, ended_at, transcript, doctor_id")
        .eq("patient_id", patient_id)
        .eq("status", "complete")
        .order("started_at", desc=False)
        .execute
    )
    visits = visits_row.data or []

    docs_row = db_call(
        supabase.table("patient_documents")
        .select("id, filename, mime_type, file_data, uploaded_at")
        .eq("patient_id", patient_id)
        .order("uploaded_at", desc=False)
        .execute
    )
    documents = docs_row.data or []

    doc_blocks = []
    doc_summaries = []
    for doc in documents:
        mime = (doc.get("mime_type") or "").lower()
        data = doc.get("file_data")
        filename = doc.get("filename") or "document"
        if not data:
            continue
        if mime in CHAT_DOC_MIME_DOCUMENT:
            doc_blocks.append({
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": data},
                "title": filename,
            })
            doc_summaries.append(f"- {filename} (PDF)")
        elif mime in CHAT_DOC_MIME_IMAGE:
            media_type = "image/jpeg" if mime == "image/jpg" else mime
            doc_blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": data},
            })
            doc_summaries.append(f"- {filename} ({mime})")
        else:
            doc_summaries.append(f"- {filename} (skipped — unsupported type {mime or 'unknown'})")

    patient_profile = {
        "name": patient.get("name"),
        "dob": patient.get("dob"),
        "sex": patient.get("sex"),
        "height_cm": patient.get("height_cm"),
        "weight_kg": patient.get("weight_kg"),
        "admitted_at": patient.get("admitted_at"),
    }

    plan_for_prompt = [
        {
            "category": p.get("category"),
            "text": p.get("text"),
            "done": bool(p.get("done")),
            "from_visit": bool(p.get("created_during_visit_id")),
            "created_at": p.get("created_at"),
        }
        for p in plan_items
    ]

    parts = [
        "PATIENT_PROFILE:",
        json.dumps(patient_profile, indent=2, default=str),
        "",
        "STRUCTURED_RECORD (current source of truth):",
        json.dumps(state_subset(state), indent=2, default=str),
        "",
        "PLAN_ITEMS (structured plan & next steps; categories are URGENT, "
        "Follow-up, Tests/Labs, Medication, Monitoring, Lifestyle; `done`=true "
        "means it's been completed; `from_visit`=true means auto-extracted from "
        "a visit transcript):",
        json.dumps(plan_for_prompt, indent=2, default=str),
        "",
    ]
    if visits:
        parts.append("VISIT_TRANSCRIPTS (chronological, oldest first):")
        for v in visits:
            transcript = (v.get("transcript") or "").strip()
            if not transcript:
                continue
            parts.append(f"--- visit {v.get('started_at')} ---")
            parts.append(transcript)
        parts.append("")
    if doc_summaries:
        parts.append("UPLOADED_DOCUMENTS (attached as content blocks above):")
        parts.extend(doc_summaries)

    return doc_blocks, "\n".join(parts)


def get_chat_row(doctor_id, patient_id):
    result = db_call(
        supabase.table("doctor_patient_chats")
        .select("messages, updated_at")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    if not result.data:
        return [], None
    row = result.data[0]
    return (row.get("messages") or []), row.get("updated_at")


@app.route("/api/patients/<patient_id>/chat", methods=["GET"])
def get_chat(patient_id):
    doctor, err = require_doctor()
    if err:
        return err
    messages, updated_at = get_chat_row(doctor["id"], patient_id)
    return jsonify({"messages": messages, "updated_at": updated_at})


@app.route("/api/patients/<patient_id>/chat", methods=["POST"])
def post_chat(patient_id):
    doctor, err = require_doctor()
    if err:
        return err
    if not anthropic_client:
        return jsonify({"error": "chat unavailable: ANTHROPIC_API_KEY not set"}), 503

    body = request.get_json(silent=True) or {}
    question = (body.get("message") or "").strip()
    if not question:
        return jsonify({"error": "message required"}), 400

    history, _ = get_chat_row(doctor["id"], patient_id)
    doc_blocks, context_text = build_chat_context(patient_id)

    primer_content = list(doc_blocks)
    primer_content.append({
        "type": "text",
        "text": (
            f"{context_text}\n\n"
            "I will now ask questions about this patient. Use only the materials "
            "above. If the answer is not present, say so."
        ),
    })

    claude_messages = [
        {"role": "user", "content": primer_content},
        {
            "role": "assistant",
            "content": (
                "Understood. I will answer using only the patient's record, the "
                "uploaded documents, and the visit transcripts above. What would "
                "you like to know?"
            ),
        },
    ]
    for h in history:
        role = h.get("role")
        content = h.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content:
            claude_messages.append({"role": role, "content": content})
    claude_messages.append({"role": "user", "content": question})

    try:
        response = anthropic_client.messages.create(
            model=LLM_MODEL,
            max_tokens=1024,
            system=CHAT_SYSTEM_PROMPT,
            messages=claude_messages,
        )
    except anthropic.APIError as e:
        return jsonify({"error": f"chat failed: {e}"}), 502

    answer = next(
        (b.text for b in response.content if getattr(b, "type", "") == "text"),
        "",
    ).strip()
    if not answer:
        answer = "I don't see that in the patient's record."

    now_iso = datetime.now(timezone.utc).isoformat()
    new_history = [
        *history,
        {"role": "user", "content": question, "timestamp": now_iso},
        {"role": "assistant", "content": answer, "timestamp": now_iso},
    ]
    db_call(
        supabase.table("doctor_patient_chats")
        .upsert({
            "doctor_id": doctor["id"],
            "patient_id": patient_id,
            "messages": new_history,
            "updated_at": now_iso,
        })
        .execute
    )

    return jsonify({"answer": answer, "messages": new_history})


@app.route("/api/patients/<patient_id>/chat", methods=["DELETE"])
def clear_chat(patient_id):
    doctor, err = require_doctor()
    if err:
        return err
    db_call(
        supabase.table("doctor_patient_chats")
        .delete()
        .eq("doctor_id", doctor["id"])
        .eq("patient_id", patient_id)
        .execute
    )
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Manual edits — append-only changelog + publish
# ---------------------------------------------------------------------------

EDITABLE_FIELDS = {
    "synopsis",
    "current_presentation",
    "active_diagnoses",
    "current_medications",
    "treatment_plan",
    "recent_vitals",
    "long_term_goals",
}


@app.route("/api/patients/<patient_id>/edits", methods=["POST"])
def publish_edits(patient_id):
    """
    Apply manual edits to patient_state. Append one row to
    patient_field_changes for each field that actually differs from current,
    then update patient_state and advance the editing doctor's snapshot.

    Body: { "fields": { "<field>": <new_value>, ... } }
    Only fields in EDITABLE_FIELDS are accepted.
    """
    doctor, err = require_doctor()
    if err:
        return err

    body = request.get_json(silent=True) or {}
    fields_in = body.get("fields") or {}
    if not isinstance(fields_in, dict):
        return jsonify({"error": "'fields' must be an object"}), 400

    unknown = set(fields_in.keys()) - EDITABLE_FIELDS
    if unknown:
        return jsonify({"error": f"unknown fields: {sorted(unknown)}"}), 400

    state_row = db_call(
        supabase.table("patient_state")
        .select("*")
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    if not state_row.data:
        return jsonify({"error": "patient state not found"}), 404
    current_state = state_row.data[0]
    current_subset = state_subset(current_state)

    now_iso = datetime.now(timezone.utc).isoformat()
    changed_fields = []
    update_payload = {}
    changelog_rows = []

    for field, new_value in fields_in.items():
        old_value = current_subset.get(field)
        if old_value == new_value:
            continue
        changed_fields.append(field)
        update_payload[field] = new_value
        changelog_rows.append({
            "patient_id": patient_id,
            "field": field,
            "before_value": old_value,
            "after_value": new_value,
            "changed_by": doctor["id"],
            "changed_at": now_iso,
            "source": "edit",
        })

    if not changed_fields:
        return jsonify({
            "current_state": current_state,
            "changed_fields": [],
        })

    # Append to changelog first (additive only — we never update or delete these rows).
    db_call(
        supabase.table("patient_field_changes").insert(changelog_rows).execute
    )

    update_payload["updated_at"] = now_iso
    db_call(
        supabase.table("patient_state")
        .update(update_payload)
        .eq("patient_id", patient_id)
        .execute
    )

    state_row = db_call(
        supabase.table("patient_state")
        .select("*")
        .eq("patient_id", patient_id)
        .limit(1)
        .execute
    )
    new_state = state_row.data[0]

    # Advance editor's snapshot to match the new truth (Option A — whole snapshot).
    db_call(
        supabase.table("doctor_patient_snapshots")
        .upsert({
            "doctor_id": doctor["id"],
            "patient_id": patient_id,
            "snapshot": state_subset(new_state),
            "snapshot_at": now_iso,
            "last_visit_id": None,
        })
        .execute
    )

    return jsonify({
        "current_state": new_state,
        "changed_fields": changed_fields,
    })


@app.route("/api/patients/<patient_id>/changes", methods=["GET"])
def get_field_changes(patient_id):
    """
    Read the changelog. With ?field=<name> returns rows for that field newest-first.
    Without a field param returns per-field counts so the UI can render history badges
    without firing one request per field.
    """
    _, err = require_doctor()
    if err:
        return err

    field = request.args.get("field")
    if not field:
        # Bulk variant — return one count per editable field. Fields with zero
        # rows are still present so the client can rely on every key existing.
        result = db_call(
            supabase.table("patient_field_changes")
            .select("field")
            .eq("patient_id", patient_id)
            .execute
        )
        counts = {f: 0 for f in EDITABLE_FIELDS}
        for row in result.data or []:
            f = row.get("field")
            if f in counts:
                counts[f] += 1
        return jsonify({"counts": counts})

    if field not in EDITABLE_FIELDS:
        return jsonify({"error": f"unknown field: {field}"}), 400

    result = db_call(
        supabase.table("patient_field_changes")
        .select("id, before_value, after_value, changed_by, changed_at, source")
        .eq("patient_id", patient_id)
        .eq("field", field)
        .order("changed_at", desc=True)
        .execute
    )
    rows = result.data or []

    doctor_ids = list({r["changed_by"] for r in rows if r.get("changed_by")})
    doctor_names = {}
    if doctor_ids:
        d_result = db_call(
            supabase.table("doctors")
            .select("id, name")
            .in_("id", doctor_ids)
            .execute
        )
        doctor_names = {d["id"]: d["name"] for d in (d_result.data or [])}

    for r in rows:
        r["changed_by_name"] = doctor_names.get(r.get("changed_by"))

    return jsonify({"changes": rows})


if __name__ == "__main__":
    app.run(debug=True, port=8080)
