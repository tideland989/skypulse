#!/usr/bin/env bash
# Start one backend, wait for it, run the conformance suite, kill it.
# Usage: scripts/run-conformance.sh node|python|remote <url>
set -uo pipefail

backend=${1:?usage: $0 node|python|remote <url>}
HOST=127.0.0.1
PORT=3000
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/skypulse-${backend}.log"

PID=""
cleanup() {
  if [[ -n "$PID" ]]; then
    # Kill the entire process group (Flask debug-mode spawns a reloader child).
    kill -- "-$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

wait_for_port() {
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 1 "http://${HOST}:${PORT}/api/v1/locations" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "service did not become ready on ${HOST}:${PORT}; see $LOG" >&2
  return 1
}

case "$backend" in
  python)
    echo "→ python: seeding"
    (cd "$ROOT/original" && uv run python seed_db.py >/dev/null)
    echo "→ python: starting on :$PORT"
    set -m
    (cd "$ROOT/original" && uv run python app.py) > "$LOG" 2>&1 &
    PID=$!
    set +m
    ;;
  node)
    echo "→ node: building"
    (cd "$ROOT/src" && npm run build >/dev/null)
    echo "→ node: seeding"
    (cd "$ROOT/src" && \
      DB_PATH=./skypulse.db \
      ANALYTICS_API_KEY=test \
      ANALYTICS_ENDPOINT=https://example.invalid/post \
      npm run start:seed >/dev/null)
    echo "→ node: starting on :$PORT"
    set -m
    (cd "$ROOT/src" && \
      DB_PATH=./skypulse.db \
      ANALYTICS_API_KEY=test \
      ANALYTICS_ENDPOINT=https://example.invalid/post \
      PORT=$PORT \
      HOST=$HOST \
      NODE_ENV=production \
      npm start) > "$LOG" 2>&1 &
    PID=$!
    set +m
    ;;
  remote)
    REMOTE_URL=${2:?usage: $0 remote <url>}
    echo "→ running conformance against remote: $REMOTE_URL"
    cd "$ROOT/src"
    CONFORMANCE_BASE_URL="$REMOTE_URL" npm run --silent conformance
    exit 0
    ;;
  *)
    echo "unknown backend: $backend (expected node|python|remote <url>)" >&2
    exit 2
    ;;
esac

wait_for_port

echo "→ running conformance against $backend"
cd "$ROOT/src"
CONFORMANCE_BASE_URL="http://$HOST:$PORT" npm run --silent conformance
