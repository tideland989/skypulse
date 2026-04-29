#!/usr/bin/env python3
"""
Seed script to generate the SkyPulse database.
"""
import sqlite3
import random

DB_PATH = "skypulse.db"

# Sample cities with approximate coordinates
CITIES = [
    ("40.71,-74.01", "New York"),
    ("34.05,-118.24", "Los Angeles"),
    ("41.88,-87.63", "Chicago"),
    ("29.76,-95.37", "Houston"),
    ("33.45,-112.07", "Phoenix"),
    ("47.61,-122.33", "Seattle"),
    ("51.51,-0.13", "London"),
    ("48.86,2.35", "Paris"),
    ("35.68,139.69", "Tokyo"),
    ("-33.87,151.21", "Sydney"),
]

PREFERENCE_TYPES = [
    "activity_type",
    "notification_enabled",
    "temperature_unit",
    "wind_sensitivity",
    "air_quality_threshold",
    "preferred_time",
    "weekly_goal",
]

ACTIVITY_VALUES = ["running", "cycling", "hiking", "walking", "swimming", "tennis", "golf", "yoga"]
BOOL_VALUES = ["true", "false"]
TEMP_UNITS = ["celsius", "fahrenheit"]
SENSITIVITY_VALUES = ["low", "medium", "high"]
TIME_VALUES = ["morning", "afternoon", "evening", "any"]


def get_random_value(pref_type):
    if pref_type == "activity_type":
        return random.choice(ACTIVITY_VALUES)
    elif pref_type == "notification_enabled":
        return random.choice(BOOL_VALUES)
    elif pref_type == "temperature_unit":
        return random.choice(TEMP_UNITS)
    elif pref_type == "wind_sensitivity":
        return random.choice(SENSITIVITY_VALUES)
    elif pref_type == "air_quality_threshold":
        return str(random.randint(15, 100))
    elif pref_type == "preferred_time":
        return random.choice(TIME_VALUES)
    elif pref_type == "weekly_goal":
        return str(random.randint(1, 7))
    return "unknown"


def generate_location_variations(base_lat, base_lon, count=10):
    """Generate location IDs with small variations around a base point"""
    locations = []
    for _ in range(count):
        lat_offset = random.uniform(-0.5, 0.5)
        lon_offset = random.uniform(-0.5, 0.5)
        lat = base_lat + lat_offset
        lon = base_lon + lon_offset
        locations.append(f"{lat:.2f},{lon:.2f}")
    return locations


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            location_id TEXT NOT NULL,
            preference_type TEXT NOT NULL,
            preference_value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Clear existing data
    cursor.execute("DELETE FROM user_preferences")

    print("Generating user preference records...")

    records = []
    record_count = 0

    for city_coords, city_name in CITIES:
        base_lat, base_lon = map(float, city_coords.split(","))

        # Generate location variations for each city
        locations = generate_location_variations(base_lat, base_lon, count=10)

        for location_id in locations:
            # Generate 5-10 user preferences per location
            num_users = random.randint(5, 10)
            for user_num in range(num_users):
                user_id = f"user_{record_count}_{user_num}"

                # Each user has 2-4 preferences
                num_prefs = random.randint(2, 4)
                selected_prefs = random.sample(PREFERENCE_TYPES, num_prefs)

                for pref_type in selected_prefs:
                    pref_value = get_random_value(pref_type)
                    records.append((user_id, location_id, pref_type, pref_value))

            record_count += 1

    # Insert all records
    cursor.executemany(
        "INSERT INTO user_preferences (user_id, location_id, preference_type, preference_value) VALUES (?, ?, ?, ?)",
        records
    )
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM user_preferences")
    total = cursor.fetchone()[0]
    print(f"Created {total} records in {DB_PATH}")


if __name__ == "__main__":
    main()
