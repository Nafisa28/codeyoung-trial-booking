"""Seed the database with 10 mentors (all Asia/Kolkata)."""

from db import init_db, get_connection

MENTORS = [
    "Aarav Sharma",
    "Priya Nair",
    "Rohan Gupta",
    "Sneha Iyer",
    "Vikram Reddy",
    "Ananya Joshi",
    "Karthik Menon",
    "Divya Patel",
    "Arjun Singh",
    "Meera Krishnan",
]

TIMEZONE = "Asia/Kolkata"


def seed():
    # Ensure tables exist before seeding
    init_db()

    conn = get_connection()
    cursor = conn.cursor()

    # Avoid duplicate seeds on re-runs
    cursor.execute("SELECT COUNT(*) FROM mentors")
    count = cursor.fetchone()[0]
    if count > 0:
        print(f"⚠️  Mentors table already has {count} rows – skipping seed.")
        conn.close()
        return

    cursor.executemany(
        "INSERT INTO mentors (name, timezone) VALUES (?, ?)",
        [(name, TIMEZONE) for name in MENTORS],
    )
    conn.commit()
    conn.close()
    print(f"🌱 Seeded {len(MENTORS)} mentors.")


if __name__ == "__main__":
    seed()
