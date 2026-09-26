import { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

const MENTORS_PREVIEW = [
  { initials: 'AS', name: 'Aarav Sharma', color: '#6366f1' },
  { initials: 'PN', name: 'Priya Nair', color: '#ec4899' },
  { initials: 'RG', name: 'Rohan Gupta', color: '#3b82f6' },
  { initials: 'SI', name: 'Sneha Iyer', color: '#10b981' },
  { initials: 'VR', name: 'Vikram Reddy', color: '#f59e0b' },
  { initials: 'AJ', name: 'Ananya Joshi', color: '#8b5cf6' },
];

function getTodayIsoString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
  // Navigation View State: 'landing' | 'booking'
  const [currentView, setCurrentView] = useState('landing');

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

  // Check if every slot for the selected date is booked
  const isFullyBooked = useMemo(() => {
    return slots.length > 0 && slots.every((slot) => !slot.available);
  }, [slots]);

  // Group slots by time of day based on parent's local hour
  const groupedSlots = useMemo(() => {
    if (!slots || slots.length === 0) return { morning: [], afternoon: [], evening: [] };

    const groups = { morning: [], afternoon: [], evening: [] };

    slots.forEach((slot) => {
      try {
        const utcDate = new Date(slot.utc_start);
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hourCycle: 'h23',
        });
        const hour = parseInt(formatter.format(utcDate), 10);

        if (hour < 12) {
          groups.morning.push(slot);
        } else if (hour < 17) {
          groups.afternoon.push(slot);
        } else {
          groups.evening.push(slot);
        }
      } catch {
        groups.afternoon.push(slot);
      }
    });

    return groups;
  }, [slots, timezone]);

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
      const url = `${API_BASE_URL}/availability?date=${encodeURIComponent(
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
          ? `Could not connect to backend server. Make sure the Flask server is running at ${API_BASE_URL}.`
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
      setValidationError('Please enter your name to complete the booking.');
      return;
    }
    if (!selectedSlot) {
      setBookingError('Please select an available time slot.');
      return;
    }

    setValidationError('');
    setBookingLoading(true);
    setBookingError(null);

    try {
      const url = `${API_BASE_URL}/book?_t=${Date.now()}`;
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
        setConfirmedBooking(data);
        setSelectedSlot(null);
      } else if (response.status === 409) {
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
    setCurrentView('booking');
    fetchAvailability();
  };

  // -------------------------------------------------------------------------
  // VIEW 1: CONFIRMATION SCREEN (When booking is completed)
  // -------------------------------------------------------------------------
  if (confirmedBooking) {
    return (
      <div className="page-wrapper">
        <div className="bg-glow bg-glow-1" />
        <div className="bg-glow bg-glow-2" />

        <nav className="top-nav">
          <div className="brand-logo" onClick={() => setCurrentView('landing')} style={{ cursor: 'pointer' }}>
            <span className="logo-badge">&lt;/&gt;</span>
            <span className="brand-title">Codeyoung</span>
          </div>
          <span className="nav-tag">Live 1:1 Trial Class</span>
        </nav>

        <main className="confirmation-wrapper">
          <div className="confirmation-hero">
            <div className="celebrate-badge">
              <span className="celebrate-icon">✓</span>
            </div>
            <h1 className="confirmation-heading">Trial Class Confirmed!</h1>
            <p className="confirmation-subheading">
              Your 1:1 coding session has been reserved. A dedicated mentor is assigned and ready for your child.
            </p>
          </div>

          <div className="card confirmation-card">
            {/* Primary Time Highlight */}
            <div className="time-highlight-box">
              <span className="time-box-label">Your Scheduled Trial Time</span>
              <div className="time-box-val">{confirmedBooking.slot_parent_local}</div>
              <div className="mentor-tz-pill">
                <svg className="pill-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>Mentor&apos;s Local Time (Asia/Kolkata):</span>
                <strong>{confirmedBooking.slot_mentor_local}</strong>
              </div>
            </div>

            {/* High-contrast Details Summary Grid */}
            <div className="details-summary-grid">
              <div className="summary-card">
                <div className="summary-card-icon">👩‍🏫</div>
                <div className="summary-card-content">
                  <span className="summary-card-label">Assigned Mentor</span>
                  <strong className="summary-card-val">{confirmedBooking.mentor_name}</strong>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">👤</div>
                <div className="summary-card-content">
                  <span className="summary-card-label">Parent / Student</span>
                  <strong className="summary-card-val">{confirmedBooking.parent_name}</strong>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">🌍</div>
                <div className="summary-card-content">
                  <span className="summary-card-label">Your Timezone</span>
                  <strong className="summary-card-val">{confirmedBooking.parent_timezone}</strong>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">🔖</div>
                <div className="summary-card-content">
                  <span className="summary-card-label">Booking Reference</span>
                  <strong className="summary-card-val code-font">#{confirmedBooking.booking_id}</strong>
                </div>
              </div>
            </div>

            {/* Meeting Link Callout */}
            <div className="session-join-box">
              <div className="session-join-text">
                <span className="join-label">Live Classroom Link</span>
                <p className="join-desc">Click below when it&apos;s time to join your interactive 1:1 session with the mentor.</p>
              </div>
              <div className="session-actions">
                <a
                  href={confirmedBooking.dummy_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-action-btn"
                >
                  Join Trial Class Session ↗
                </a>
                <span className="url-preview">{confirmedBooking.dummy_link}</span>
              </div>
            </div>

            {/* What's Next Steps */}
            <div className="next-steps-box">
              <h3 className="next-steps-title">What happens next?</h3>
              <div className="next-steps-list">
                <div className="step-point">
                  <span className="step-dot">1</span>
                  <span>Keep your booking reference <strong>#{confirmedBooking.booking_id}</strong> for session records.</span>
                </div>
                <div className="step-point">
                  <span className="step-dot">2</span>
                  <span>Ensure your laptop or tablet has Google Chrome, a working webcam, and microphone.</span>
                </div>
                <div className="step-point">
                  <span className="step-dot">3</span>
                  <span>Join the meeting link 5 minutes before your scheduled start time.</span>
                </div>
              </div>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              className="reset-btn"
              onClick={handleBookAnother}
            >
              ← Book another trial slot
            </button>
          </div>
        </main>

        <footer className="site-footer">
          <p>© Codeyoung. Personalized 1:1 Coding Mentorship for Ages 6–17.</p>
          <p className="footer-sub">Need assistance? Email support@codeyoung-demo.example</p>
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 2: DEDICATED BOOKING VIEW (Focused, full-width)
  // -------------------------------------------------------------------------
  if (currentView === 'booking') {
    return (
      <div className="page-wrapper">
        <div className="bg-glow bg-glow-1" />
        <div className="bg-glow bg-glow-2" />

        {/* Top Navbar with Back button */}
        <nav className="top-nav">
          <div className="brand-logo" onClick={() => setCurrentView('landing')} style={{ cursor: 'pointer' }}>
            <span className="logo-badge">&lt;/&gt;</span>
            <span className="brand-title">Codeyoung</span>
          </div>
          <button
            type="button"
            className="back-nav-btn"
            onClick={() => setCurrentView('landing')}
          >
            ← Back to Overview
          </button>
        </nav>

        {/* Focused Booking Container */}
        <main className="booking-view-container">
          <div className="booking-view-header">
            <span className="booking-view-eyebrow">Direct Reservation</span>
            <h1 className="booking-view-title">Schedule Your 1:1 Trial Class</h1>
            <p className="booking-view-subtitle">
              Enter your details, choose your date, and pick an open slot. Times convert automatically to your local timezone.
            </p>
          </div>

          <div className="card focused-booking-card">
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

            {/* Slots Section */}
            <section className="slots-section">
              <div className="section-header">
                <h2 className="section-title">
                  Available Times {slots.length > 0 && `(${slots.filter((s) => s.available).length} open)`}
                </h2>
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

              {/* Loading */}
              {loading && (
                <div className="loading-state">
                  <div className="spinner" />
                  <p>Checking mentor availability across timezone...</p>
                </div>
              )}

              {/* Error Banner */}
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

              {/* Empty state: No date chosen */}
              {!loading && !error && !selectedDate && (
                <div className="empty-state">
                  <span className="empty-state-icon">📅</span>
                  <strong>No Date Selected</strong>
                  <p>Please pick a trial date above to view available time slots.</p>
                </div>
              )}

              {/* Empty state: No slots returned */}
              {!loading && !error && slots.length === 0 && selectedDate && (
                <div className="empty-state">
                  <span className="empty-state-icon">🔍</span>
                  <strong>No Slots Found</strong>
                  <p>No mentor slots are scheduled for this date. Please try another date.</p>
                </div>
              )}

              {/* Fully Booked Banner */}
              {!loading && !error && isFullyBooked && (
                <div className="fully-booked-banner">
                  <span className="banner-icon">⚠️</span>
                  <div>
                    <strong>This date is fully booked</strong>
                    <p>All mentor slots for this date are reserved. Please select another date above to find open trial slots.</p>
                  </div>
                </div>
              )}

              {/* Categorized Slots Groups */}
              {!loading && !error && slots.length > 0 && (
                <div className="slot-groups-container">
                  {/* Morning Slots */}
                  {groupedSlots.morning.length > 0 && (
                    <div className="slot-group">
                      <div className="group-heading">
                        <span className="group-icon">🌅</span>
                        <span>Morning Slots</span>
                      </div>
                      <div className="slots-grid">
                        {groupedSlots.morning.map((slot) => {
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
                              <div className="slot-btn-inner">
                                <svg className="slot-clock-icon" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                <span className="slot-time">{slot.local_start_for_parent}</span>
                              </div>
                              <span className="slot-status">
                                {slot.available ? (isSelected ? 'Selected ✓' : 'Available') : 'Booked'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Slots */}
                  {groupedSlots.afternoon.length > 0 && (
                    <div className="slot-group">
                      <div className="group-heading">
                        <span className="group-icon">☀️</span>
                        <span>Afternoon Slots</span>
                      </div>
                      <div className="slots-grid">
                        {groupedSlots.afternoon.map((slot) => {
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
                              <div className="slot-btn-inner">
                                <svg className="slot-clock-icon" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                <span className="slot-time">{slot.local_start_for_parent}</span>
                              </div>
                              <span className="slot-status">
                                {slot.available ? (isSelected ? 'Selected ✓' : 'Available') : 'Booked'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Evening Slots */}
                  {groupedSlots.evening.length > 0 && (
                    <div className="slot-group">
                      <div className="group-heading">
                        <span className="group-icon">🌙</span>
                        <span>Evening Slots</span>
                      </div>
                      <div className="slots-grid">
                        {groupedSlots.evening.map((slot) => {
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
                              <div className="slot-btn-inner">
                                <svg className="slot-clock-icon" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                <span className="slot-time">{slot.local_start_for_parent}</span>
                              </div>
                              <span className="slot-status">
                                {slot.available ? (isSelected ? 'Selected ✓' : 'Available') : 'Booked'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Booking Error Banner */}
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
                    <span className="summary-label">Selected Slot</span>
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
          </div>
        </main>

        <footer className="site-footer">
          <p>© Codeyoung. Personalized 1:1 Coding Mentorship for Ages 6–17.</p>
          <p className="footer-sub">Need assistance? Email support@codeyoung-demo.example</p>
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 3: LANDING VIEW (Single Clean Column with bottom CTA)
  // -------------------------------------------------------------------------
  return (
    <div className="page-wrapper">
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      {/* Top Navbar */}
      <nav className="top-nav">
        <div className="brand-logo">
          <span className="logo-badge">&lt;/&gt;</span>
          <span className="brand-title">Codeyoung</span>
        </div>
        <div className="nav-actions">
          <span className="badge-pill">★ 4.9/5 Parent Rating</span>
          <button
            type="button"
            className="nav-cta-btn"
            onClick={() => setCurrentView('booking')}
          >
            Book Free Trial →
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" />
            Live 1:1 Interactive Mentorship
          </div>
          <h1 className="hero-title">
            Book Your Free 1:1 <span className="gradient-text">Coding Trial</span>
          </h1>
          <p className="hero-subtitle">
            Spark your child&apos;s creativity with live project-based coding lessons.
            Choose your timezone, pick an open date, and get matched with a certified mentor.
          </p>

          <button
            type="button"
            className="hero-cta-btn"
            onClick={() => setCurrentView('booking')}
          >
            Book Your Free Trial Now →
          </button>

          {/* Trust Badges */}
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-num">500+</span>
              <span className="stat-label">Happy Students</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-card">
              <span className="stat-num">10</span>
              <span className="stat-label">Expert Mentors</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-card">
              <span className="stat-num">100%</span>
              <span className="stat-label">Free Session</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Single-Column Content Section */}
      <main className="landing-content-column">
        {/* How It Works */}
        <section className="landing-section">
          <div className="section-title-wrap">
            <span className="section-tag">Simple Process</span>
            <h2 className="landing-section-heading">How It Works</h2>
            <p className="landing-section-sub">Get started in 3 easy steps with zero commitment.</p>
          </div>

          <div className="how-it-works-grid">
            <div className="how-step-card">
              <div className="how-step-num">01</div>
              <h3>Choose Date &amp; Time</h3>
              <p>Pick a date that suits your family. All times automatically adjust to your local timezone.</p>
            </div>
            <div className="how-step-card">
              <div className="how-step-num">02</div>
              <h3>Get Matched 1:1</h3>
              <p>We assign a certified coding mentor dedicated entirely to your child&apos;s session.</p>
            </div>
            <div className="how-step-card">
              <div className="how-step-num">03</div>
              <h3>Build Live Projects</h3>
              <p>Join the live video classroom to build interactive games and animations from day one.</p>
            </div>
          </div>
        </section>

        {/* Why Book a Trial? */}
        <section className="landing-section">
          <div className="section-title-wrap">
            <span className="section-tag">Benefits</span>
            <h2 className="landing-section-heading">Why Book a Trial Class?</h2>
            <p className="landing-section-sub">Personalized STEM education designed around your child.</p>
          </div>

          <div className="benefits-grid-3">
            <div className="benefit-card-full">
              <div className="benefit-icon-box indigo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3>1:1 Dedicated Attention</h3>
              <p>Tailored curriculum matching your child&apos;s age, interests, and prior coding background.</p>
            </div>

            <div className="benefit-card-full">
              <div className="benefit-icon-box purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3>Real Interactive Projects</h3>
              <p>Build real games and apps using Scratch, Python, Web, and AI tools with live guidance.</p>
            </div>

            <div className="benefit-card-full">
              <div className="benefit-icon-box emerald">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3>Skill Assessment &amp; Roadmap</h3>
              <p>Receive comprehensive mentor evaluation and a personalized coding learning path.</p>
            </div>
          </div>
        </section>

        {/* Mentors Preview */}
        <section className="landing-section mentors-landing-section">
          <div className="mentors-banner-card">
            <div className="mentors-banner-content">
              <span className="section-tag">Verified Faculty</span>
              <h2>Meet Our Certified STEM Mentors</h2>
              <p>Our educators are experienced programmers and trained pedagogues passionate about inspiring kids.</p>
              
              <div className="mentors-avatar-row-large">
                {MENTORS_PREVIEW.map((m) => (
                  <div
                    key={m.initials}
                    className="mentor-avatar large"
                    style={{ backgroundColor: m.color }}
                    title={m.name}
                  >
                    {m.initials}
                  </div>
                ))}
                <div className="mentor-avatar large more">+4</div>
              </div>

              <div className="mentor-trust-note">
                <span>✓ 100% Background-Checked &amp; STEM Certified</span>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA Card */}
        <section className="bottom-cta-card">
          <div className="bottom-cta-content">
            <h2>Ready to start your child&apos;s coding journey?</h2>
            <p>Reserve a live 1:1 trial class in under 60 seconds. No credit card required.</p>
            <button
              type="button"
              className="bottom-cta-btn"
              onClick={() => {
                setCurrentView('booking');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Book Your Free Trial →
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="logo-badge sm">&lt;/&gt;</span>
            <span className="footer-title">Codeyoung</span>
          </div>
          <p className="footer-tagline">
            Empowering children worldwide with problem solving, computational thinking, and project-based coding skills.
          </p>
          <div className="footer-contact">
            <span>Need help with booking? Contact <strong>support@codeyoung-demo.example</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
