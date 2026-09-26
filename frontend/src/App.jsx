import { useState, useEffect, useMemo } from 'react';
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
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Timezone list including auto-detected if not in common list
  const timezoneOptions = useMemo(() => {
    const exists = COMMON_TIMEZONES.some((tz) => tz.value === detectedTz);
    if (!exists && detectedTz) {
      return [{ value: detectedTz, label: `Detected: ${detectedTz}` }, ...COMMON_TIMEZONES];
    }
    return COMMON_TIMEZONES;
  }, [detectedTz]);

  const minDate = getTodayIsoString();

  // 2. Fetch availability on date or timezone change
  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      setError(null);
      return;
    }

    const abortController = new AbortController();

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      // Clear stale slots immediately so old data is never shown if fetch fails
      setSlots([]);

      try {
        const url = `http://localhost:5000/availability?date=${encodeURIComponent(
          selectedDate
        )}&parent_timezone=${encodeURIComponent(timezone)}&_t=${Date.now()}`;

        const response = await fetch(url, {
          cache: 'no-store',
          signal: abortController.signal,
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
        if (err.name === 'AbortError') {
          return;
        }
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
    };

    fetchAvailability();

    return () => {
      abortController.abort();
    };
  }, [selectedDate, timezone]);

  const handleRetry = () => {
    // Force re-fetch by triggering fetch with current state
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    setSlots([]);

    const url = `http://localhost:5000/availability?date=${encodeURIComponent(
      selectedDate
    )}&parent_timezone=${encodeURIComponent(timezone)}&_t=${Date.now()}`;

    fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || errorData.error || `Server responded with HTTP ${response.status}`
          );
        }
        return response.json();
      })
      .then((data) => {
        setSlots(data);
      })
      .catch((err) => {
        console.error('Retry failed:', err);
        const errorMsg =
          err.message === 'Failed to fetch' ||
          err.message?.includes('NetworkError') ||
          err.message?.includes('fetch')
            ? 'Could not connect to backend server. Make sure the Flask server is running at http://localhost:5000.'
            : err.message || 'An unexpected error occurred while fetching availability.';
        setError(errorMsg);
        setSlots([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSlotClick = (slot) => {
    if (!slot.available) return;
    console.log('Selected slot:', slot);
    setSelectedSlot(slot);
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">Book a 1:1 Live Coding Trial Class</h1>
        <p className="subtitle">
          Select your preferred date and time. All slots are converted to your local timezone.
        </p>
      </header>

      <main className="card">
        <section className="form-grid">
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
            <h2 className="section-title">Available Slots ({slots.length})</h2>
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
                    disabled={!slot.available}
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

          {/* Selected Slot Note */}
          {selectedSlot && (
            <div className="selected-info">
              <span>Selected Slot:</span>
              <strong>{selectedSlot.local_start_for_parent}</strong>
              <small>(Check console for slot object)</small>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
