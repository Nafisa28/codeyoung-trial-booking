import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, date
from zoneinfo import ZoneInfo
from db import init_db, get_connection, DB_PATH
import sqlite3

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])  # Vite dev server default

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")

SLOT_START_HOUR = 9   # 9:00 AM IST (inclusive)
SLOT_END_HOUR = 21    # 9:00 PM IST (exclusive → last slot starts at 20:00)
MAX_BOOKINGS_PER_MENTOR_PER_DAY = 2


def get_day_slot_range(target_date: date):
    """Return the list of 12 UTC datetimes for the given IST date."""
    slots_utc = []
    for hour in range(SLOT_START_HOUR, SLOT_END_HOUR):
        ist_dt = datetime(target_date.year, target_date.month, target_date.day,
                          hour, 0, 0, tzinfo=IST)
        slots_utc.append(ist_dt.astimezone(UTC))
    return slots_utc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/availability", methods=["GET"])
def availability():
    """Return 12 hourly slots for a given date with availability status.

    Query params:
        date            – YYYY-MM-DD (interpreted as an IST calendar date)
        parent_timezone – IANA timezone string for the parent's local display
    """
    date_str = request.args.get("date")
    parent_tz_str = request.args.get("parent_timezone")

    # ---- validate inputs --------------------------------------------------
    if not date_str or not parent_tz_str:
        return jsonify({"error": "Both 'date' and 'parent_timezone' query params are required."}), 400

    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    try:
        parent_tz = ZoneInfo(parent_tz_str)
    except (KeyError, Exception):
        return jsonify({"error": f"Unknown timezone: {parent_tz_str}"}), 400

    # ---- generate the 12 IST slots in UTC ---------------------------------
    slots_utc = get_day_slot_range(target_date)
    first_utc_iso = slots_utc[0].isoformat()
    last_utc_iso = slots_utc[-1].isoformat()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM mentors")
    all_mentor_ids = {row["id"] for row in cur.fetchall()}

    cur.execute(
        "SELECT mentor_id, slot_utc FROM bookings "
        "WHERE slot_utc >= ? AND slot_utc <= ?",
        (first_utc_iso, last_utc_iso),
    )
    bookings = cur.fetchall()
    conn.close()

    # ---- build lookup structures ------------------------------------------
    mentor_day_count: dict[int, int] = {}        # mentor_id → total bookings this day
    slot_booked_mentors: dict[str, set] = {}     # slot_utc_iso → {mentor_ids}

    for row in bookings:
        mid = row["mentor_id"]
        s_utc = row["slot_utc"]
        mentor_day_count[mid] = mentor_day_count.get(mid, 0) + 1
        slot_booked_mentors.setdefault(s_utc, set()).add(mid)

    # ---- compute per-slot availability ------------------------------------
    result = []
    for utc_dt in slots_utc:
        utc_iso = utc_dt.isoformat()
        parent_dt = utc_dt.astimezone(parent_tz)

        booked_here = slot_booked_mentors.get(utc_iso, set())
        slot_available = any(
            mentor_day_count.get(mid, 0) < MAX_BOOKINGS_PER_MENTOR_PER_DAY
            and mid not in booked_here
            for mid in all_mentor_ids
        )

        result.append({
            "utc_start": utc_iso,
            "local_start_for_parent": parent_dt.strftime("%I:%M %p %Z, %b %d, %Y"),
            "available": slot_available,
        })

    return jsonify(result)


@app.route("/book", methods=["POST"])
def book():
    """Create a booking for an available slot with race-condition protection.

    Request JSON:
        date            - YYYY-MM-DD
        slot_utc        - ISO 8601 UTC timestamp
        parent_name     - String
        parent_timezone - IANA timezone string
    """
    data = request.get_json(silent=True)
    if not data:
        try:
            import json as _json
            data = _json.loads(request.get_data(as_text=True))
        except Exception:
            data = None
    if not data:
        return jsonify({"error": "invalid_payload", "message": "Request body must be valid JSON."}), 400

    date_str = data.get("date")
    slot_utc_str = data.get("slot_utc")
    parent_name = data.get("parent_name")
    parent_tz_str = data.get("parent_timezone")

    if not all([date_str, slot_utc_str, parent_name, parent_tz_str]):
        return jsonify({
            "error": "missing_fields",
            "message": "Fields 'date', 'slot_utc', 'parent_name', and 'parent_timezone' are all required."
        }), 400

    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "invalid_date", "message": "Invalid date format. Use YYYY-MM-DD."}), 400

    try:
        parent_tz = ZoneInfo(parent_tz_str)
    except (KeyError, Exception):
        return jsonify({"error": "invalid_timezone", "message": f"Unknown timezone: {parent_tz_str}"}), 400

    try:
        requested_slot_utc = datetime.fromisoformat(slot_utc_str)
        if requested_slot_utc.tzinfo is None:
            requested_slot_utc = requested_slot_utc.replace(tzinfo=UTC)
        else:
            requested_slot_utc = requested_slot_utc.astimezone(UTC)
    except ValueError:
        return jsonify({"error": "invalid_slot", "message": "Invalid slot_utc format. Use ISO 8601 UTC string."}), 400

    # Ensure requested slot is valid for this IST date
    valid_slots_utc = get_day_slot_range(target_date)
    first_utc_iso = valid_slots_utc[0].isoformat()
    last_utc_iso = valid_slots_utc[-1].isoformat()
    norm_slot_utc_iso = requested_slot_utc.isoformat()

    if not any(s.isoformat() == norm_slot_utc_iso for s in valid_slots_utc):
        return jsonify({"error": "invalid_slot", "message": "The requested slot is not a valid slot for this date."}), 400

    # Execute inside transaction with immediate/exclusive lock
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.cursor()

        cur.execute("SELECT id, name, timezone FROM mentors ORDER BY id")
        mentors = cur.fetchall()

        if not mentors:
            conn.execute("ROLLBACK")
            return jsonify({"error": "no_mentors", "message": "No mentors registered in system."}), 500

        # Query all bookings for this day in IST
        cur.execute(
            "SELECT mentor_id, slot_utc FROM bookings "
            "WHERE slot_utc >= ? AND slot_utc <= ?",
            (first_utc_iso, last_utc_iso),
        )
        bookings = cur.fetchall()

        mentor_day_count: dict[int, int] = {}
        slot_booked_mentors: set[int] = set()

        for row in bookings:
            mid = row["mentor_id"]
            s_utc = row["slot_utc"]
            mentor_day_count[mid] = mentor_day_count.get(mid, 0) + 1
            if s_utc == norm_slot_utc_iso:
                slot_booked_mentors.add(mid)

        # Check 1: Day fully booked (all mentors reached 2 bookings/day)
        all_mentors_capped = all(
            mentor_day_count.get(m["id"], 0) >= MAX_BOOKINGS_PER_MENTOR_PER_DAY
            for m in mentors
        )
        if all_mentors_capped:
            conn.execute("ROLLBACK")
            return jsonify({
                "error": "day_fully_booked",
                "message": "All mentors are fully booked for this date."
            }), 409

        # Find eligible mentor: has < 2 bookings today and not booked in this slot
        eligible_mentors = [
            m for m in mentors
            if mentor_day_count.get(m["id"], 0) < MAX_BOOKINGS_PER_MENTOR_PER_DAY
            and m["id"] not in slot_booked_mentors
        ]

        # Check 2: Specific slot unavailable
        if not eligible_mentors:
            conn.execute("ROLLBACK")
            return jsonify({
                "error": "slot_unavailable",
                "message": "This specific slot is no longer available."
            }), 409

        # Pick mentor with lowest daily bookings for fair distribution
        chosen_mentor = min(eligible_mentors, key=lambda m: mentor_day_count.get(m["id"], 0))
        dummy_link = f"https://codeyoung-demo.example/session/{uuid.uuid4()}"

        cur.execute(
            """
            INSERT INTO bookings (mentor_id, parent_name, parent_timezone, slot_utc, dummy_link)
            VALUES (?, ?, ?, ?, ?)
            """,
            (chosen_mentor["id"], parent_name, parent_tz_str, norm_slot_utc_iso, dummy_link),
        )
        booking_id = cur.lastrowid
        conn.execute("COMMIT")

        parent_dt = requested_slot_utc.astimezone(parent_tz)
        mentor_dt = requested_slot_utc.astimezone(IST)

        return jsonify({
            "booking_id": booking_id,
            "mentor_name": chosen_mentor["name"],
            "parent_name": parent_name,
            "parent_timezone": parent_tz_str,
            "slot_parent_local": parent_dt.strftime("%I:%M %p %Z, %b %d, %Y"),
            "slot_mentor_local": mentor_dt.strftime("%I:%M %p %Z, %b %d, %Y"),
            "dummy_link": dummy_link
        }), 201

    except Exception as e:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return jsonify({"error": "server_error", "message": str(e)}), 500
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)

