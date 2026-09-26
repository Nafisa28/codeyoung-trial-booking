"""Seed enough bookings to make every slot on a given date FULLY BOOKED.

Usage:  python seed_full_day.py 2027-01-20

With 10 mentors × 2 bookings each = 20 bookings, every mentor hits the
daily cap of 2 and no mentor is free for any slot → all 12 slots show
available: false.
"""
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from db import init_db, get_connection

IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")

SLOT_HOURS = list(range(9, 21))  # 9 AM – 8 PM IST (12 slots)


def seed_full_day(date_str: str):
    init_db()

    from datetime import date as dt_date
    target = dt_date.fromisoformat(date_str)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM mentors ORDER BY id")
    mentor_ids = [row["id"] for row in cur.fetchall()]

    if not mentor_ids:
        print("[ERR] No mentors found. Run seed.py first.")
        conn.close()
        return

    booking_num = 0
    for mentor_id in mentor_ids:
        for j in range(2):  # 2 bookings per mentor
            hour = SLOT_HOURS[(booking_num) % len(SLOT_HOURS)]
            ist_dt = datetime(target.year, target.month, target.day,
                              hour, 0, 0, tzinfo=IST)
            utc_dt = ist_dt.astimezone(UTC)

            cur.execute(
                "INSERT INTO bookings "
                "(mentor_id, parent_name, parent_timezone, slot_utc, dummy_link) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    mentor_id,
                    f"Test Parent {booking_num + 1}",
                    "America/New_York",
                    utc_dt.isoformat(),
                    f"https://meet.example.com/test-{booking_num + 1}",
                ),
            )
            booking_num += 1

    conn.commit()
    conn.close()
    print(f"[OK] Seeded {booking_num} bookings for {date_str} - all mentors at capacity.")


if __name__ == "__main__":
    target_date = sys.argv[1] if len(sys.argv) > 1 else "2027-01-20"
    seed_full_day(target_date)
