# SkyPulse Backend

Python/Flask backend for the SkyPulse mobile app. Uses SQLite for storage.

## Running

Requires Python 3.10+ and [uv](https://github.com/astral-sh/uv).

```bash
# Generate the SQLite database (once)
uv run python seed_db.py

# Start the server
uv run python app.py
```

Server runs at `http://localhost:3000`.

## Example

```bash
curl "http://localhost:3000/api/v1/activity-score?lat=40.71&lon=-74.01"
```

## Database

The seed script creates a small dataset for local development. In production, the `user_preferences` table has 2M+ rows.

```sql
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    preference_type TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
