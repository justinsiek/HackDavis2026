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
    "physical_exam",
    "past_medical_history",
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
            "physical_exam": "",
            "past_medical_history": "",
            "long_term_goals": "",
        }
    return {
        "synopsis": state.get("synopsis") or "",
        "current_presentation": state.get("current_presentation") or "",
        "active_diagnoses": state.get("active_diagnoses") or [],
        "current_medications": state.get("current_medications") or [],
        "treatment_plan": state.get("treatment_plan") or "",
        "recent_vitals": state.get("recent_vitals"),
        "physical_exam": state.get("physical_exam") or "",
        "past_medical_history": state.get("past_medical_history") or "",
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
                    "One-sentence clinical synopsis in the standard format: "
                    "'[age]yo [sex] with [key history], here for [chief complaint].' "
                    "Update only if new key context emerges. Empty if not enough info yet."
                ),
            },
            "current_presentation": {
                "type": "string",
                "description": (
                    "The patient's subjective account of what they're experiencing this "
                    "admission/visit — narrative form, what they said happened. "
                    "Empty if nothing reported."
                ),
            },
            "active_diagnoses": {
                "type": "array",
                "description": "Conditions currently being treated.",
                "items": {
                    "type": "object",
                    "properties": {
                        "condition": {"type": "string"},
                        "since": {"type": "string", "description": "When first noted. Empty if unknown."},
                        "notes": {"type": "string", "description": "Brief detail. Empty if none."},
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
                "description": "Plan and next steps for this admission. Short paragraph. Empty if none.",
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
            "physical_exam": {
                "type": "string",
                "description": (
                    "Brief narrative of physical exam findings (lung sounds, edema, etc.). "
                    "Empty if no exam performed."
                ),
            },
            "past_medical_history": {
                "type": "string",
                "description": (
                    "Pre-existing chronic conditions, prior surgeries, family history. "
                    "Brief narrative. Empty if none documented yet."
                ),
            },
            "long_term_goals": {
                "type": "string",
                "description": "Forward-looking care goals. Empty if none set yet.",
            },
        },
        "required": [
            "synopsis",
            "current_presentation",
            "active_diagnoses",
            "current_medications",
            "treatment_plan",
            "recent_vitals",
            "physical_exam",
            "past_medical_history",
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
            "You are a clinical scribe. Update the patient's structured medical record "
            "based on a new visit transcript. Carry forward all unchanged fields verbatim. "
            "Only modify fields the transcript clearly addresses. Do NOT invent vitals, "
            "medications, diagnoses, or history that aren't explicitly mentioned. "
            "If a field has no information yet and the transcript doesn't mention it, "
            "use an empty string for strings, an empty array for lists, and null for objects. "
            "Always return a complete record using the update_patient_state tool."
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
        max_tokens=400,
        system=(
            "You write short clinical handoff notes. Given a doctor's prior view of "
            "a patient and the current state, write 2-4 plain sentences describing "
            "what has changed since they last saw the patient. Speak directly to the "
            "doctor in second person. If nothing meaningful has changed, return an "
            "empty string. No preamble, no markdown, no labels — just the prose."
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
    _, err = require_doctor()
    if err:
        return err
    result = db_call(
        supabase.table("patients")
        .select("id, name, dob, sex, height_cm, weight_kg, photo_data, admitted_at")
        .order("admitted_at", desc=True)
        .execute
    )
    return jsonify({"patients": result.data or []})


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

    return jsonify({
        "patient": patient,
        "current_state": current_state,
        "viewer_snapshot": viewer_snapshot,
        "narrative": narrative,
        "is_first_view": is_first_view,
    })


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


@app.route("/api/visits/<visit_id>/finalize", methods=["POST"])
def finalize_visit(visit_id):
    doctor, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    transcript = body.get("transcript", "")
    now_iso = datetime.now(timezone.utc).isoformat()

    db_call(
        supabase.table("visits")
        .update({
            "transcript": transcript,
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
