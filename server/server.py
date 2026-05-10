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
        },
        "required": [
            "synopsis",
            "current_presentation",
            "active_diagnoses",
            "current_medications",
            "treatment_plan",
            "recent_vitals",
            "long_term_goals",
        ],
    },
}


def extract_patient_state(current_state, transcript):
    """Run the unified extractor; returns the new state subset."""
    base = state_subset(current_state)
    if not anthropic_client or not transcript.strip():
        return base
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
            "null for fields with no information."
        ),
        tools=[UPDATE_PATIENT_STATE_TOOL],
        tool_choice={"type": "tool", "name": "update_patient_state"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"CURRENT_STATE:\n{json.dumps(base, indent=2)}\n\n"
                    f"TRANSCRIPT:\n{transcript}"
                ),
            }
        ],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "update_patient_state":
            return block.input
    return base


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


def narrate_diff(snapshot, current_state):
    """Ask Claude to narrate what's changed between a doctor's snapshot and current state."""
    if not anthropic_client:
        return ""
    snap = state_subset(snapshot)
    cur = state_subset(current_state)
    if snap == cur:
        return ""
    response = anthropic_client.messages.create(
        model=LLM_MODEL,
        max_tokens=200,
        system=(
            "You write terse clinical handoff lines. Given a doctor's prior view and "
            "the current state, summarize what changed in 1-2 short sentences, "
            "≤40 words total. Use clinical shorthand. Speak directly to the doctor "
            "(second person). Skip anything unchanged. If nothing meaningful "
            "changed, return an empty string. No preamble, no markdown, no labels."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"YOUR_LAST_VIEW:\n{json.dumps(snap, indent=2)}\n\n"
                    f"CURRENT_STATE:\n{json.dumps(cur, indent=2)}"
                ),
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
    if not is_first_view and current_state:
        snap_at = viewer_snapshot.get("snapshot_at")
        cur_at = current_state.get("updated_at")
        if snap_at and cur_at and snap_at < cur_at:
            narrative = narrate_diff(
                viewer_snapshot.get("snapshot") or {}, current_state
            )

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
        "is_first_view": is_first_view,
        "documents": docs_result.data or [],
        "visits": visits,
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

    new_state = extract_patient_state(current_state, transcript)

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

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=8080)
