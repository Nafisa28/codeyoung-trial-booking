import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "codeyoung.db")


def get_connection():
    """Return a new sqlite3 connection with Row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the mentors and bookings tables if they don't already exist."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS mentors (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            timezone    TEXT    NOT NULL   -- IANA timezone string, e.g. "Asia/Kolkata"
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bookings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            mentor_id       INTEGER NOT NULL,
            parent_name     TEXT    NOT NULL,
            parent_timezone TEXT    NOT NULL,
            slot_utc        TEXT    NOT NULL,   -- ISO 8601 UTC timestamp
            dummy_link      TEXT    NOT NULL,
            FOREIGN KEY (mentor_id) REFERENCES mentors (id)
        );
        """
    )

    conn.commit()
    conn.close()
    print("✅ Database initialised – tables ready.")


if __name__ == "__main__":
    init_db()
