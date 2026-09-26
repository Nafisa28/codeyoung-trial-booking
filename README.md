# Codeyoung Trial Class Booking System

A full-stack appointment-booking system that lets parents book a 1:1 live coding trial class, matching them with an available mentor and handling cross-timezone scheduling correctly — including DST.

Built for the Codeyoung Full-Stack Engineer assignment.

## Tech Stack

- **Backend**: Python (Flask), SQLite
- **Frontend**: React (Vite)
- **Timezone handling**: Python's built-in `zoneinfo` module (IANA timezone database) — no manual UTC offset math

## Setup & Run Instructions

### Backend
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
python seed.py        # seeds 10 mentors
python app.py          # runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # runs on http://localhost:5173
```

Open `http://localhost:5173` in your browser. Both servers must be running simultaneously.

## Architecture Overview

The system has two main endpoints. `GET /availability` generates 12 hourly slots (9:00 AM–8:00 PM IST) for a given date and checks, for each slot, whether at least one of the 10 mentors is both under their 2-bookings-per-day cap and free at that specific hour. Slot times are converted to the parent's requested timezone using `zoneinfo`, which correctly handles DST transitions (verified against a US "spring forward" date). `POST /book` re-validates availability server-side (never trusting the frontend), assigns any qualifying free mentor, and inserts the booking inside a `BEGIN IMMEDIATE` SQLite transaction with a re-check immediately before insert — this prevents two simultaneous requests from both being assigned the same mentor slot (tested explicitly with concurrent requests).

A key design point: a given clock-hour (e.g., 9:00 AM) can be booked by multiple different parents simultaneously, since each booking is matched to one of the 10 independent mentors rather than reserving the entire hour system-wide. This is intentional — it's what allows the system to handle 20 parents/day against 10 mentors without artificial bottlenecks.

The frontend always defers to the backend for timezone conversion (re-fetching from `/availability` whenever the parent changes their timezone, rather than doing client-side offset math), keeping a single source of truth for DST-correct scheduling.

## What We Built vs. Explicitly Didn't Build

**Built:**
- Timezone-aware availability and booking, including correct DST handling
- Race-condition-safe booking (transaction-level re-check)
- Differentiated error states: `day_fully_booked` vs `slot_unavailable`
- Full booking UI: landing page, dedicated booking flow, confirmation screen with dual-timezone display
- Client-side and server-side validation
- Graceful handling of backend-unreachable states (cache-busting, clear error messaging, retry)

**Explicitly not built (out of scope per the task):**
- Real email/notification delivery — the task specifies a dummy link is sufficient
- Authentication/login — not required for this booking flow
- Payments or signup — task only covers the trial-class booking step
- Rescheduling/cancellation — not part of the stated requirements
- Interactive mentor profiles — the "Meet Our Mentors" section is intentionally decorative, matching the task's dummy-data scope

## Design Decisions & Assumptions

- **Slot granularity**: hourly slots, 9:00 AM–9:00 PM IST (12/day), since the task didn't specify a duration. With 10 mentors × 2 bookings/day = 20 total capacity, this exactly matches the stated 20 parents/day.
- **Mentors**: all 10 are based in `Asia/Kolkata`, per the task's description.
- **Parents**: assumed US/UK per the task, but the system accepts any valid IANA timezone.
- **Dummy links**: point to a non-resolving placeholder domain (`codeyoung-demo.example`), consistent with the task's note that links are assumed to work without needing a real backend.
- **DST**: tested explicitly against `2027-03-14` (a US "spring forward" date) to confirm correct EST→EDT conversion, including the non-existent 2 AM hour being correctly skipped.

## Known Limitations

- Uses SQLite for simplicity; a production system would use a more robust database with proper connection pooling.
- No automated test suite — all testing was done manually and is documented in `TRANSCRIPT.md`.
- The "Meet Our Mentors" section on the landing page is decorative/non-interactive.

## Live Demo

- Frontend: https://codeyoung-trial-booking.vercel.app
- Backend API: https://codeyoung-trial-booking.onrender.com

Note: hosted on free-tier services. The backend may take 30-60 seconds to 
wake up on first request if idle (Render free tier spins down after 
inactivity), and the database resets on service restarts since it's not 
using persistent storage in this deployment. For guaranteed, stable 
testing, please use the local setup instructions above.