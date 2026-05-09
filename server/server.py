import os
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = Flask(__name__)
CORS(app, allow_headers=["Content-Type", "X-Doctor-Username"])


def db_call(fn, *args, **kwargs):
    """Run a Supabase call, retrying once on a stale HTTP/2 connection."""
    try:
        return fn(*args, **kwargs)
    except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError):
        return fn(*args, **kwargs)


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
        .select("id, name, dob, sex, height_cm, weight_kg, admitted_at")
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


@app.route("/api/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    _, err = require_doctor()
    if err:
        return err
    result = db_call(
        supabase.table("patients").select("*").eq("id", patient_id).limit(1).execute
    )
    if not result.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"patient": result.data[0]})


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
    _, err = require_doctor()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    transcript = body.get("transcript", "")
    db_call(
        supabase.table("visits")
        .update({
            "transcript": transcript,
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "status": "complete",
        })
        .eq("id", visit_id)
        .execute
    )
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=8080)
