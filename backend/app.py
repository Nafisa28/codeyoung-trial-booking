from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, date
from zoneinfo import ZoneInfo
from db import init_db, get_connection

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
    except KeyError:
        return jsonify({"error": f"Unknown timezone: {parent_tz_str}"}), 400

    # ---- generate the 12 IST slots in UTC ---------------------------------
    slots_utc = []
    for hour in range(SLOT_START_HOUR, SLOT_END_HOUR):
        ist_dt = datetime(target_date.year, target_date.month, target_date.day,
                          hour, 0, 0, tzinfo=IST)
        slots_utc.append(ist_dt.astimezone(UTC))

    # ---- fetch bookings that overlap this day's slot window ---------------
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


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
