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