import { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'US - Eastern (New York, Miami, Atlanta)' },
  { value: 'America/Chicago', label: 'US - Central (Chicago, Dallas, Houston)' },
  { value: 'America/Denver', label: 'US - Mountain (Denver, Salt Lake City)' },
  { value: 'America/Los_Angeles', label: 'US - Pacific (Los Angeles, Seattle, SF)' },
  { value: 'America/Anchorage', label: 'US - Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'US - Hawaii (Honolulu)' },
  { value: 'America/Toronto', label: 'Canada - Eastern (Toronto, Montreal)' },
  { value: 'America/Vancouver', label: 'Canada - Pacific (Vancouver)' },
  { value: 'Europe/London', label: 'UK - London (GMT / BST)' },
  { value: 'Europe/Paris', label: 'Europe - Paris, Rome, Madrid (CET / CEST)' },
  { value: 'Europe/Berlin', label: 'Europe - Berlin, Frankfurt (CET / CEST)' },
  { value: 'Asia/Kolkata', label: 'India - Standard Time (IST)' },
  { value: 'Asia/Dubai', label: 'UAE - Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Japan - Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia - Sydney, Melbourne (AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand - Auckland (NZST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

function getTodayIsoString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
  // 1. Detect browser timezone
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  const [timezone, setTimezone] = useState(detectedTz);
  const [selectedDate, setSelectedDate] = useState(getTodayIsoString());
  const [parentName, setParentName] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Booking submission states
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [validationError, setValidationError] = useState('');

  // Timezone list including auto-detected if not in common list
  const timezoneOptions = useMemo(() => {
    const exists = COMMON_TIMEZONES.some((tz) => tz.value === detectedTz);
    if (!exists && detectedTz) {
      return [{ value: detectedTz, label: `Detected: ${detectedTz}` }, ...COMMON_TIMEZONES];
    }
    return COMMON_TIMEZONES;
  }, [detectedTz]);

  const minDate = getTodayIsoString();

  // 2. Fetch availability helper
  const fetchAvailability = useCallback(async (signal) => {
    if (!selectedDate) {
      setSlots([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    setBookingError(null);
    setSlots([]);

    try {
      const url = `http://localhost:5000/availability?date=${encodeURIComponent(
        selectedDate
      )}&parent_timezone=${encodeURIComponent(timezone)}&_t=${Date.now()}`;

      const response = await fetch(url, {
        cache: 'no-store',
        signal: signal || undefined,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.error || `Server responded with HTTP ${response.status}`
        );
      }

      const data = await response.json();
      setSlots(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to fetch availability:', err);
      const errorMsg =
        err.message === 'Failed to fetch' ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('fetch')
          ? 'Could not connect to backend server. Make sure the Flask server is running at http://localhost:5000.'
          : err.message || 'An unexpected error occurred while fetching availability.';
      setError(errorMsg);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, timezone]);

  // Fetch on date / timezone change
  useEffect(() => {
    const abortController = new AbortController();
    fetchAvailability(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [fetchAvailability]);

  const handleRetry = () => {
    fetchAvailability();
  };

  const handleSlotClick = (slot) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    setBookingError(null);
    setValidationError('');
  };

  // 3. Booking submission
  const handleConfirmBooking = async (e) => {
    e.preventDefault();

    if (!parentName.trim()) {
      setValidationError('Please enter parent name before confirming.');
      return;
    }
    if (!selectedSlot) {
      setBookingError('Please select a time slot.');
      return;
    }

    setValidationError('');
    setBookingLoading(true);
    setBookingError(null);

    try {
      const url = `http://localhost:5000/book?_t=${Date.now()}`;
      const payload = {
        date: selectedDate,
        slot_utc: selectedSlot.utc_start,
        parent_name: parentName.trim(),
        parent_timezone: timezone,
      };

      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 201) {
        // Success
        setConfirmedBooking(data);
        setSelectedSlot(null);
      } else if (response.status === 409) {
        // Conflict: day_fully_booked or slot_unavailable
        let friendlyMsg = 'This slot is no longer available. Please choose a different slot.';
        if (data.error === 'day_fully_booked') {
          friendlyMsg = 'All mentors are fully booked for this date. Please select another date.';
        } else if (data.error === 'slot_unavailable') {
          friendlyMsg = 'This specific slot was just booked by another parent. Please choose another available slot.';
        } else if (data.message) {
          friendlyMsg = data.message;
        }

        setBookingError(friendlyMsg);
        setSelectedSlot(null);
        // Automatically refresh availability so parent sees current state
        fetchAvailability();
      } else {
        throw new Error(data.message || data.error || `Booking failed with status ${response.status}`);
      }
    } catch (err) {
      console.error('Booking submission error:', err);
      const msg =
        err.message === 'Failed to fetch' || err.message?.includes('fetch')
          ? 'Unable to connect to the server. Please check your connection and try again.'
          : err.message || 'An error occurred during booking. Please try again.';
      setBookingError(msg);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleBookAnother = () => {
    setConfirmedBooking(null);
    setSelectedSlot(null);
    setBookingError(null);
    setValidationError('');
    fetchAvailability();
  };

  // -------------------------------------------------------------------------
  // Render Confirmation Screen
  // -------------------------------------------------------------------------
  if (confirmedBooking) {
    return (
      <div className="container">
        <header className="header">
          <div className="success-icon-badge">✓</div>
          <h1 className="title">Trial Class Confirmed!</h1>
          <p className="subtitle">
            Your 1:1 live coding trial session has been successfully scheduled.
          </p>
        </header>

        <main className="card confirmation-card">
          <div className="confirmation-highlight">
            <span className="confirmation-label">Your Scheduled Class Time</span>
            <div className="primary-time">{confirmedBooking.slot_parent_local}</div>
            <div className="mentor-time-line">
              <span className="mentor-time-badge">Mentor&apos;s Local Time (Asia/Kolkata):</span>{' '}
              <strong>{confirmedBooking.slot_mentor_local}</strong>
            </div>
          </div>

          <div className="confirmation-details-grid">
            <div className="detail-item">
              <span className="detail-label">Assigned Mentor</span>
              <strong className="detail-value">{confirmedBooking.mentor_name}</strong>
            </div>

            <div className="detail-item">
              <span className="detail-label">Parent / Student</span>
              <strong className="detail-value">{confirmedBooking.parent_name}</strong>
            </div>

            <div className="detail-item">
              <span className="detail-label">Your Timezone</span>
              <span className="detail-value">{confirmedBooking.parent_timezone}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Booking Reference</span>
              <span className="detail-value code-pill">#{confirmedBooking.booking_id}</span>
            </div>
          </div>

          <div className="session-link-box">
            <span className="session-link-label">Class Meeting Link:</span>
            <div className="session-link-action">
              <a
                href={confirmedBooking.dummy_link}
                target="_blank"
                rel="noopener noreferrer"
                className="join-btn"
              >
                Join Trial Class Session ↗
              </a>
              <span className="raw-url">{confirmedBooking.dummy_link}</span>
            </div>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleBookAnother}
          >
            ← Book another slot
          </button>
        </main>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render Booking Form & Slot Picker
  // -------------------------------------------------------------------------
  return (
    <div className="container">
      <header className="header">
        <h1 className="title">Book a 1:1 Live Coding Trial Class</h1>
        <p className="subtitle">
          Select your preferred date, time, and enter your details to reserve a mentor.
        </p>
      </header>

      <main className="card">
        {/* Form Inputs Grid */}
        <section className="form-grid">
          {/* Parent Name */}
          <div className="form-group full-width">
            <label htmlFor="parent-name" className="label">
              Parent Name <span className="required-star">*</span>
            </label>
            <input
              id="parent-name"
              type="text"
              className={`input ${validationError ? 'input-error' : ''}`}
              placeholder="e.g. Sarah Jenkins"
              value={parentName}
              onChange={(e) => {
                setParentName(e.target.value);
                if (validationError) setValidationError('');
              }}
              required
            />
            {validationError && (
              <span className="field-error-text">{validationError}</span>
            )}
          </div>

          {/* Timezone Selector */}
          <div className="form-group">
            <label htmlFor="tz-select" className="label">
              Your Timezone
              {timezone === detectedTz && (
                <span className="badge">Auto-detected</span>
              )}
            </label>
            <select
              id="tz-select"
              className="select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} {tz.value === detectedTz ? ' (Your Local TZ)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="form-group">
            <label htmlFor="date-select" className="label">
              Trial Date
            </label>
            <input
              id="date-select"
              type="date"
              className="input"
              min={minDate}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </section>

        {/* Status / Loading / Error */}
        <section className="slots-section">
          <div className="section-header">
            <h2 className="section-title">Select a Time Slot ({slots.length})</h2>
            {selectedDate && (
              <span className="date-tag">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>

          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <p>Checking mentor availability...</p>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <div className="error-content">
                <strong>Unable to load slots</strong>
                <p>{error}</p>
              </div>
              <button
                type="button"
                className="retry-btn"
                onClick={handleRetry}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && slots.length === 0 && selectedDate && (
            <div className="empty-state">No slots found for this date.</div>
          )}

          {!loading && !error && !selectedDate && (
            <div className="empty-state">Please select a date above to view availability.</div>
          )}

          {/* Slots Grid */}
          {!loading && !error && slots.length > 0 && (
            <div className="slots-grid">
              {slots.map((slot) => {
                const isSelected = selectedSlot?.utc_start === slot.utc_start;
                return (
                  <button
                    key={slot.utc_start}
                    type="button"
                    disabled={!slot.available || bookingLoading}
                    onClick={() => handleSlotClick(slot)}
                    className={`slot-btn ${
                      slot.available ? 'available' : 'unavailable'
                    } ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="slot-time">{slot.local_start_for_parent}</span>
                    <span className="slot-status">
                      {slot.available ? (isSelected ? 'Selected' : 'Available') : 'Booked'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Booking Error Banner (e.g. 409 Conflict or Network Error) */}
          {bookingError && (
            <div className="error-banner booking-error-banner">
              <div className="error-content">
                <strong>Booking Notice</strong>
                <p>{bookingError}</p>
              </div>
              <button
                type="button"
                className="retry-btn"
                onClick={() => setBookingError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Booking Action Bar */}
          {selectedSlot && (
            <div className="booking-action-bar">
              <div className="selected-slot-summary">
                <span className="summary-label">Selected Slot:</span>
                <strong className="summary-time">{selectedSlot.local_start_for_parent}</strong>
              </div>

              <button
                type="button"
                className="confirm-btn"
                disabled={bookingLoading}
                onClick={handleConfirmBooking}
              >
                {bookingLoading ? (
                  <>
                    <span className="btn-spinner" />
                    Confirming Booking...
                  </>
                ) : (
                  'Confirm Booking →'
                )}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
