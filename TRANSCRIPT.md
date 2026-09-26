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

## Phase 2 — Booking Endpoint

### Prompt:
Add a POST /book endpoint to the Flask backend. Scope: ONLY this endpoint.

Request body (JSON): { "date": "YYYY-MM-DD", "slot_utc": "<ISO 8601 UTC timestamp from /availability>", "parent_name": "...", "parent_timezone": "<IANA string>" }

Logic:
1. Re-check availability server-side for that exact slot and date (never trust the frontend) — find any mentor who is free for that slot and hasn't hit their 2-bookings/day cap
2. If a mentor is available: create a booking row, generate a dummy link in the format "https://codeyoung-demo.example/session/<uuid4>", and return the booking confirmation as JSON with: mentor_name, slot time shown in BOTH parent_timezone and Asia/Kolkata (mentor's timezone), and the dummy_link
3. If no mentor is available, return HTTP 409 with a JSON body distinguishing two cases:
   - { "error": "day_fully_booked", "message": "..." } if every mentor is at their 2-booking daily cap
   - { "error": "slot_unavailable", "message": "..." } if the day isn't full but this specific slot has no free mentor

Handle the race condition where two requests hit this endpoint for the same slot at the same time — use a database transaction with a re-check immediately before the insert, so we never double-book a mentor beyond their 2/day cap.

Do not build any frontend for this yet.

Give me curl commands to test:
1. A successful booking
2. An attempt on a date that's already fully booked (use seed_full_day.py to set this up)
3. Two rapid, near-simultaneous requests for the same single remaining slot — explain how to actually test this race condition (e.g. a small script firing both requests in parallel), not just two sequential curl calls

### Response summary:
Added POST /book with server-side re-validation, BEGIN IMMEDIATE transaction 
locking for race safety, and differentiated 409 errors (day_fully_booked vs 
slot_unavailable). Successful bookings return mentor assignment, dummy link 
(uuid4), and slot time in both parent and mentor timezones.

Independently verified:
- Successful booking (id 82): confirmed request slot_utc, API response, and 
  persisted DB row all match exactly
- Fully-booked rejection: confirmed via DB query (2027-01-20, all mentors at capacity)
- Race condition (2 simultaneous requests for the last slot on 2027-08-10): 
  confirmed via DB that exactly one booking was inserted (all 10 mentors at 
  exactly 2, not 1 or 3) — second request correctly received day_fully_booked 
  since the winning request pushed the last available mentor to capacity

---

## Phase 3 — Frontend Slot Picker

### Prompt:
Build the React frontend (already scaffolded with Vite) for the parent booking flow. Scope: date + slot selection UI only, no booking submission yet.

- Detect the browser's local timezone automatically using Intl.DateTimeFormat().resolvedOptions().timeZone, but let the parent override it via a dropdown of common IANA timezones (at least US and UK options, plus a few others)
- A date picker for the trial class date (disable past dates)
- On date selection, call GET http://localhost:5000/availability?date=...&parent_timezone=... and render the 12 slots as buttons, showing local_start_for_parent clearly on each
- Slots where available is false are visibly disabled (greyed out, not clickable), not hidden
- Show a loading spinner/state while fetching
- Show a clear error state if the API call fails (e.g. backend not running)

Do not implement booking submission yet — clicking an available slot should just log it to the console for now.

Keep styling simple and clean — usability is what's being evaluated here, not visual flourish. Use plain CSS or a minimal approach, nothing heavy.

### Response summary:
Built React frontend with auto-detected browser timezone (manual override 
dropdown for US/UK/EU/India/APAC), date picker with past dates disabled, 
and a 12-slot grid fetched from /availability. Available slots are 
clickable with visual selection feedback and console logging; unavailable 
slots show as disabled ("Booked"). Timezone changes trigger a fresh 
backend fetch (not client-side conversion), keeping the backend as the 
single source of truth for DST-correct times.

Bug found and fixed during verification: when the backend was stopped, 
the frontend showed stale slot data instead of an error state, due to 
browser HTTP caching and slots state not being reset on fetch failure. 
Fixed with cache-busting headers/query param, immediate state reset on 
fetch start, AbortController cleanup for rapid switching, and explicit 
network-failure error messaging.

Independently verified:
- Fully-booked date correctly shows all 12 slots disabled
- Timezone switch correctly re-fetches and shifts displayed times
- Slot selection logs to console with visual highlight
- Backend-down state: confirmed stale data clears, error banner with 
  "Could not connect to backend server..." message and Retry button 
  displays correctly; Retry successfully reloads slots once backend restarts

---

## Phase 4 — Booking Submission & Confirmation Screen

### Prompt:
Wire up the booking submission and confirmation screen in the React frontend.

- Add a "Parent Name" text input, shown above the slot grid, required before a booking can be submitted
- When an available slot is clicked, instead of just logging to console, show a "Confirm Booking" button (or similar) that the parent clicks to actually submit
- On confirm: POST to http://localhost:5000/book with { date, slot_utc, parent_name, parent_timezone }, using the same cache-busting/fetch approach as the availability calls
- On success (HTTP 201): replace the booking form with a confirmation screen showing:
  - The trial class time in the parent's local timezone (large, prominent)
  - The mentor's name
  - The dummy link, shown as a clickable button/link
  - A smaller secondary line showing the same time converted to the mentor's timezone (Asia/Kolkata), labeled clearly as "mentor's local time" so it doesn't confuse the parent
  - A "Book another slot" button to reset back to the picker
- On 409 (day_fully_booked or slot_unavailable): show a friendly, non-technical error message specific to each case, and let the parent pick a different slot — refresh the availability list automatically since the slot they wanted may no longer be shown as free
- On network/server error during submission: show a generic retry-able error, consistent with the pattern already used for availability fetching
- Add basic validation: don't allow submission if parent name is empty

Do not touch the availability-fetching logic that's already working — only add the new submission flow on top of it.

### Response summary:
Added Parent Name input with validation, slot confirmation flow (select → 
"Confirm Booking" → POST /book), and a confirmation screen showing class 
time in parent's local timezone, mentor's local time (Asia/Kolkata) 
clearly labeled separately, mentor name, booking reference, and a dummy 
meeting link. 409 errors (day_fully_booked / slot_unavailable) show 
friendly messages and auto-refresh availability. "Book another slot" 
resets to the picker.

Independently verified:
- Successful bookings (id 83, id 84) with different parent timezones: DB 
  rows confirmed to exactly match displayed confirmation details
- Dual-timezone display confirmed correct (America/New_York vs Asia/Kolkata 
  shown as two different, correctly labeled times for the same moment)
- Dummy link correctly points to a non-resolving placeholder domain, 
  consistent with task requirements
- Fully-booked date (2027-01-20): frontend correctly disables all 12 slots 
  client-side; backend independently confirmed to return 409 
  day_fully_booked via direct API call
- "Book another slot" correctly resets to the picker form

---

## Phase 5 — Polish Pass

### Prompt:
Do a polish pass on the entire React frontend. Don't change any working logic (availability fetching, booking submission, error handling) — this is purely presentation.

1. Overall visual design:
   - Give the page a proper branded header area (a title/logo placeholder for "Codeyoung Trial Class Booking", not just a plain heading)
   - Use a cohesive color palette (pick one primary accent color and use it consistently for buttons, selected states, and highlights)
   - Improve spacing and visual hierarchy so the form, slot grid, and confirmation screen all feel like one consistent product, not separately-styled pieces
   - Add subtle visual polish: rounded corners, soft shadows, smooth hover states on buttons and slots — nothing flashy, just clean and modern

2. Mobile responsiveness:
   - Test and fix layout at 375px width (iPhone SE size) — the timezone/date row should stack vertically, the slot grid should go to a single column, and nothing should overflow horizontally

3. Empty/edge states:
   - Show a friendly placeholder message before any date is selected (e.g. "Pick a date to see available times") instead of an empty slots area
   - If ALL 12 slots for a selected date come back unavailable, show a clear message above the slot grid (e.g. "This date is fully booked — please try another date") instead of just leaving 12 greyed-out buttons with no explanation
   - Ensure the parent name validation error is visually clear but not alarming (avoid harsh red if the current styling is too aggressive)

4. Consistency check:
   - Make sure loading spinners, error banners, and the confirmation screen all share the same visual language (same border radius, same font weights, same spacing scale) as the rest of the app

### Response summary:
Added branded header (Codeyoung pill badge), unified indigo/slate color 
palette across buttons/selections/highlights, consistent spacing and 
border-radius design tokens across all components. Mobile responsive 
layout (single-column stacking below 640px/480px breakpoints, full-width 
buttons, URL wrapping to prevent overflow). Added "no date selected" 
placeholder and a fully-booked banner shown above the grid when all 12 
slots are unavailable. Softened validation error styling to warm tones.

Independently verified:
- Desktop view: branding and color palette render correctly
- Mobile view (375-400px): single-column layout, no horizontal overflow, 
  branded header scales down appropriately
- Fully-booked banner displays correctly on 2027-01-20
- "No date selected" placeholder shows before any date is picked
- Full booking flow re-tested end-to-end after styling changes (booking 
  #88) — confirmed the polish pass didn't break underlying functionality

---

## Phase 5.5 — Major Redesign

### Prompt:
Make two fixes/changes to the React frontend. Keep all existing logic (fetch calls, booking submission, timezone handling, error states, validation) completely untouched.

1. FIX — Confirmation screen contrast bug:
The four detail boxes (Assigned Mentor, Parent/Student, Your Timezone, Booking Reference) currently have a dark background with dark text, making them nearly unreadable. Fix the contrast — either lighten these boxes to match the rest of the confirmation screen's card style, or make the text white/light if a dark background is intentional. They should be as readable as the green scheduled-time box and the light purple meeting-link box.

2. RESTRUCTURE — Split into a landing view and a separate booking view:
Currently the two-column layout (benefits on left, booking form on right) becomes visually uneven once scrolled, since the left column is much shorter than the right.

Restructure into two distinct views within the same single-page app (no routing library needed — just conditional rendering based on a "view" state, e.g. 'landing' vs 'booking'):

- Landing view: Keep the hero section, the "How it works" 3-step section, the "Why book a trial?" benefits, and the mentor avatars — all in a single clean column (no more awkward two-column split). At the bottom of this content, add a prominent "Book Your Free Trial →" call-to-action button.
- Booking view: Clicking that CTA switches to a dedicated, focused view containing ONLY the Parent Name input, timezone/date selectors, and the slot grid (the actual booking form) — full width, clean, no distracting side content. Include a simple "← Back" link/button at the top of this view to return to the landing view.
- After a successful booking, the confirmation screen replaces the booking view as it currently does.

Keep the same visual design system (colors, fonts, spacing) across both views — this should feel like two pages of the same site, not two different apps.

After making changes, list everything changed, and confirm no fetch/booking/timezone/validation logic was touched.

### Response summary:
Fixed confirmation screen contrast bug: the four detail boxes (Assigned 
Mentor, Parent/Student, Your Timezone, Booking Reference) had a dark 
background with dark text; restyled with light neutral background 
(#f8fafc), high-contrast slate text (#0f172a), uppercase slate labels 
(#64748b), and indigo-accented booking reference (#4f46e5) — now matches 
the readability of the green scheduled-time and purple meeting-link boxes.

Restructured the single-page layout into two distinct views via a 
currentView state ('landing' vs 'booking'), avoiding any new routing 
dependency:
- Landing view: navbar (logo + rating badge + CTA), hero with headline 
  and trust badges, "How It Works" 3-step section, "Why Book a Trial" 
  benefit cards, "Meet Our Verified Mentors" avatar strip (decorative, 
  not interactive), bottom CTA banner, footer.
- Booking view: focused full-width form (parent name, timezone, date, 
  morning/afternoon/evening categorized slot grid), with a "← Back to 
  Overview" link to return to landing.
- Confirmation screen (on HTTP 201) replaces the booking view as before, 
  now with the fixed contrast styling.

No fetch/booking/timezone/validation logic was touched — confirmed by 
Antigravity and independently re-verified.

Independently verified:
- Landing page renders as a single clean column, no more uneven 
  two-column scroll layout
- Booking view is focused and full-width, functions identically to 
  before the restructure
- Confirmation screen detail boxes now fully readable (verified visually)
- Full booking flow re-tested successfully after the restructure 
  (bookings #91, #92)
- Confirmed expected multi-mentor slot behavior: the same clock-hour 
  (e.g. 9:00 AM) remains bookable by multiple parents since each booking 
  matches to one of 10 independent mentors rather than reserving the 
  entire hour globally — this is correct behavior per the Phase 1 
  capacity design, not a bug
- "Meet Our Verified Mentors" avatar section confirmed to be intentionally 
  decorative (not interactive) — consistent with task scope, no click 
  functionality required or added

---