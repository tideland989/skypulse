from flask import Flask, request, jsonify
import requests
import sqlite3
from datetime import datetime

app = Flask(__name__)

# Analytics configuration
ANALYTICS_API_KEY = "sk_live_RoundsPlatform2024xYz"
ANALYTICS_ENDPOINT = "https://httpbin.org/post"

# Database path
DB_PATH = "skypulse.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def save_statistics(user_id, lat, lon, score):
    """Save usage statistics to analytics service"""
    requests.post(
        ANALYTICS_ENDPOINT,
        headers={"Authorization": f"Bearer {ANALYTICS_API_KEY}"},
        json={
            "event": "activity_score_calculated",
            "user_id": user_id,
            "latitude": lat,
            "longitude": lon,
            "score": score,
            "timestamp": datetime.now().isoformat()
        }
    )

def get_weather(lat, lon):
    """Fetch current weather from Open-Meteo"""
    resp = requests.get(
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
    )
    return resp.json()

def get_air_quality(lat, lon):
    """Fetch air quality data from Open-Meteo"""
    resp = requests.get(
        f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=pm10,pm2_5"
    )
    return resp.json()

def calculate_outdoor_score(weather, air_quality):
    """Calculate outdoor activity score (0-100)"""
    score = 100

    # Weather factors
    current = weather.get("current_weather", {})
    temp = current.get("temperature", 20)
    wind = current.get("windspeed", 0)

    # Temperature penalty (ideal: 18-24°C)
    if temp < 10 or temp > 32:
        score -= 30
    elif temp < 15 or temp > 28:
        score -= 15

    # Wind penalty
    if wind > 30:
        score -= 25
    elif wind > 20:
        score -= 10

    # Air quality factors
    current_aq = air_quality.get("current", {})
    pm25 = current_aq.get("pm2_5", 0)
    pm10 = current_aq.get("pm10", 0)

    # PM2.5 penalty (WHO guideline: <15 μg/m³)
    if pm25 > 50:
        score -= 30
    elif pm25 > 25:
        score -= 15
    elif pm25 > 15:
        score -= 5

    # PM10 penalty
    if pm10 > 100:
        score -= 20
    elif pm10 > 50:
        score -= 10

    return max(0, min(100, score))

@app.route("/api/v1/activity-score", methods=["GET"])
def activity_score():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    user_id = request.args.get("user_id")

    if not lat or not lon:
        return jsonify({"error": "lat and lon are required"}), 400

    try:
        lat = float(lat)
        lon = float(lon)
    except ValueError:
        return jsonify({"error": "lat and lon must be numbers"}), 400

    weather = get_weather(lat, lon)
    air_quality = get_air_quality(lat, lon)

    # Calculate base score
    score = calculate_outdoor_score(weather, air_quality)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT preference_type, preference_value FROM user_preferences WHERE location_id = ?",
        (f"{lat:.2f},{lon:.2f}",)
    )
    preferences = cursor.fetchall()
    conn.close()

    # Apply user preference adjustments
    recommendation = "Good conditions for outdoor activities"
    if score < 50:
        recommendation = "Consider indoor activities today"
    elif score < 70:
        recommendation = "Moderate conditions - light outdoor activities recommended"

    # Save statistics to analytics
    save_statistics(user_id, lat, lon, score)

    return jsonify({
        "score": score,
        "recommendation": recommendation,
        "weather": {
            "temperature": weather.get("current_weather", {}).get("temperature"),
            "wind_speed": weather.get("current_weather", {}).get("windspeed"),
            "conditions": weather.get("current_weather", {}).get("weathercode")
        },
        "air_quality": {
            "pm2_5": air_quality.get("current", {}).get("pm2_5"),
            "pm10": air_quality.get("current", {}).get("pm10")
        }
    })

@app.route("/api/v1/locations", methods=["GET"])
def list_locations():
    """List all tracked locations"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT location_id FROM user_preferences LIMIT 100")
    locations = [row["location_id"] for row in cursor.fetchall()]
    conn.close()
    return jsonify({"locations": locations})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=3000)
