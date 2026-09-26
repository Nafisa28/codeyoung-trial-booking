"""Test script to simulate and verify race conditions on POST /book.

Scenario:
On a test date (e.g. 2027-08-10), we set up the DB state so that:
- 9 mentors already have 2 bookings (daily cap reached).
- 1 mentor has 1 booking (at slot 09:00 IST).
- For slot 10:00 IST (UTC: 2027-08-10T04:30:00+00:00), there is EXACTLY 1 mentor available (the 10th mentor).
- We fire 2 simultaneous POST requests for this slot.
- Result: Exactly ONE request must succeed (HTTP 201) and ONE must fail (HTTP 409).
"""

import sqlite3
import urllib.request
import urllib.error
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo
from db import init_db, get_connection

IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")

TEST_DATE = "2027-08-10"
TARGET_SLOT_UTC = "2027-08-10T04:30:00+00:00"  # 10:00 AM IST


def setup_race_condition_state():
    init_db()
    conn = get_connection()
    cur = conn.cursor()

    # Clear existing bookings for this test date
    # IST day starts at 09:00 IST (03:30 UTC) and ends at 21:00 IST (15:30 UTC)
    cur.execute("DELETE FROM bookings WHERE slot_utc LIKE '2027-08-10%'")

    cur.execute("SELECT id, name FROM mentors ORDER BY id")
    mentors = cur.fetchall()
    if len(mentors) < 10:
        print("[ERR] Need at least 10 mentors in DB. Run seed.py first.")
        conn.close()
        return False

    # First 9 mentors get 2 bookings each (slots 9am and 10am)
    for m in mentors[:9]:
        for hour in [9, 10]:
            ist_dt = datetime(2027, 8, 10, hour, 0, 0, tzinfo=IST)
            utc_dt = ist_dt.astimezone(UTC)
            cur.execute(
                "INSERT INTO bookings (mentor_id, parent_name, parent_timezone, slot_utc, dummy_link) "
                "VALUES (?, ?, ?, ?, ?)",
                (m["id"], f"Pre-parent {m['id']}", "America/New_York", utc_dt.isoformat(), f"https://meet/test-{m['id']}-{hour}")
            )

    # 10th mentor gets 1 booking at 9am (free at 10am, and has 1 slot left before hitting cap)
    last_mentor = mentors[9]
    ist_dt = datetime(2027, 8, 10, 9, 0, 0, tzinfo=IST)
    cur.execute(
        "INSERT INTO bookings (mentor_id, parent_name, parent_timezone, slot_utc, dummy_link) "
        "VALUES (?, ?, ?, ?, ?)",
        (last_mentor["id"], f"Pre-parent {last_mentor['id']}", "America/New_York", ist_dt.astimezone(UTC).isoformat(), "https://meet/test-last")
    )

    conn.commit()
    conn.close()
    print(f"[OK] State prepped: 19 bookings inserted. Only 1 slot left for 10:00 AM IST by mentor {last_mentor['name']}.")
    return True


def make_booking_request(parent_name):
    url = "http://localhost:5000/book"
    payload = {
        "date": TEST_DATE,
        "slot_utc": TARGET_SLOT_UTC,
        "parent_name": parent_name,
        "parent_timezone": "America/New_York"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))
    except Exception as e:
        return 500, {"error": str(e)}


def run_test():
    if not setup_race_condition_state():
        return

    print("Firing 2 concurrent booking requests for the last remaining slot...")
    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_booking_request, "Concurrent Parent A")
        f2 = executor.submit(make_booking_request, "Concurrent Parent B")
        res1 = f1.result()
        res2 = f2.result()

    print(f"\nResponse 1: HTTP {res1[0]} -> {res1[1]}")
    print(f"Response 2: HTTP {res2[0]} -> {res2[1]}")

    statuses = [res1[0], res2[0]]
    if 201 in statuses and 409 in statuses:
        print("\n[SUCCESS] Race condition handled correctly! Exactly 1 succeeded (201) and 1 was rejected (409).")
    else:
        print(f"\n[FAIL] Unexpected response statuses: {statuses}")


if __name__ == "__main__":
    run_test()
