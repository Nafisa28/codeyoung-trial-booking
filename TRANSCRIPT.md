## Phase 0 — Scaffold

### Prompt:
Scaffold a full-stack appointment-booking project with this exact structure:

/backend  — Python + Flask + SQLite
/frontend — React app created with Vite

Backend requirements for this phase ONLY:
- requirements.txt with Flask, flask-cors, and pytz (or use Python's built-in zoneinfo)
- db.py that creates two tables on startup if they don't exist, using sqlite3:
  - mentors: id, name, timezone (IANA string, e.g. "Asia/Kolkata")
  - bookings: id, mentor_id, parent_name, parent_timezone, slot_utc (ISO 8601 UTC timestamp), dummy_link
- seed.py that inserts exactly 10 mentors, all timezone "Asia/Kolkata", with realistic names
- app.py with a single GET /health endpoint returning { "status": "ok" }, running on port 5000 with CORS enabled for the frontend

Do NOT build the booking logic, availability logic, or any frontend UI yet — that's later phases. Just scaffold, seed, and confirm the server boots.

After generating the code, give me the exact terminal commands to set up a virtualenv, install dependencies, seed the DB, and start the server so I can verify it works before we continue.

### Response summary:
Created backend/ (app.py, db.py, seed.py, requirements.txt) and frontend/ 
(Vite + React scaffold). db.py creates mentors + bookings tables idempotently. 
seed.py inserts 10 mentors (Asia/Kolkata), skips on re-run. app.py runs Flask 
on port 5000 with CORS scoped to localhost:5173, single /health endpoint.

Verified: curl /health returns {"status":"ok"}, mentors table confirmed at 10 rows via sqlite3.

---
## Phase 1 — Availability Logic

### Prompt:
Add availability logic to the Flask backend. Scope: ONLY this endpoint, no booking creation yet.

GET /availability?date=YYYY-MM-DD&parent_timezone=<IANA string>

Business rules:
- Slots are hourly, 9:00 AM to 9:00 PM IST, on the given date (12 slots/day)
- A mentor can take at most 2 bookings total per day (across any slots)
- For each slot, the slot is "available" if at least one mentor is free for it under the above rule

Response: JSON array of slots, each with:
- utc_start (ISO 8601)
- local_start_for_parent (converted to parent_timezone using Python's zoneinfo module, human-readable format)
- available (boolean)

Use Python's built-in zoneinfo module for all timezone conversions — no manual offset math, no pytz.

Write this so conversions are correct across a DST transition date. As a specific test case, verify behavior for 2027-03-14 (US "spring forward" date).

Do not build the frontend or the booking/POST endpoint yet — only this GET endpoint and its logic.

After generating the code, give me 3 curl commands I can run to test it:
1. A normal date with no bookings yet
2. The DST transition date (2027-03-14)
3. A date where you've pre-seeded enough bookings to make it fully booked (explain how to seed that scenario for testing)

### Response summary:
Added GET /availability to app.py. Generates 12 hourly slots (9 AM–8 PM IST) 
as timezone-aware datetimes, converted to UTC via zoneinfo. Checks each 
mentor's daily booking count (<2) to determine slot availability. Converts 
UTC slots to parent's local timezone with abbreviation (EST/EDT etc). Added 
seed_full_day.py test helper.

Independently verified (not just AI-reported):
- Normal date (2027-06-15, pre-seed) → all 12 slots available
- DB query confirms seed_full_day.py correctly inserts exactly 2 bookings/mentor
- Fully booked day (post-seed) → all 12 slots correctly show unavailable
- DST transition (2027-03-14): confirmed via raw JSON that 01:30 AM EST is 
  immediately followed by 03:30 AM EDT (02:30 correctly skipped, non-existent 
  hour during spring-forward), abbreviation flips exactly at the transition, 
  underlying UTC times remain uniformly 1 hour apart throughout

---