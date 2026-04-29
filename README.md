# SkyPulse Node.js port

TypeScript/Express 5 rewrite of the Flask service.

## Run locally

### Node directly

Requires **Node ≥ 22.12.0**.

```bash
cd src
# optionally fill ANALYTICS_API_KEY + ANALYTICS_ENDPOINT
cp .env.example .env
npm install
# populates the database
npm run seed
npm run dev
# or: npm run build && npm start
```

```bash
curl "http://localhost:3000/api/v1/activity-score?lat=40.71&lon=-74.01"
```

### Docker Compose

```bash
# auto-seeds on first start
docker compose up
```

`.env` at the repo root is honored if present (overrides any of the env vars
in the table below) but isn't required — the service boots on defaults.

### Conformance tests

An additional suite of tests to ensure API contract conformance.

```bash
# starts the services and runs the suite against Python, then Node
make conform
# Python only
make conform-python
# Node only
make conform-node
make clean
```

## Deploy

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply

ssh root@<droplet-ipv4>

git clone https://github.com/tideland989/skypulse && cd skypulse
docker compose up
```

For a real deployment, drop a `.env` next to `docker-compose.yml` with the
production `ANALYTICS_API_KEY` + `ANALYTICS_ENDPOINT` before `docker compose
up`.

## Changes from the original

### Secrets & config

- Hardcoded `sk_live_…` API key → optional `ANALYTICS_API_KEY` env var.
- `ANALYTICS_ENDPOINT` is now an env var; default still points at
  `httpbin.org/post` to match the original. Active value is logged at boot
  so a misconfigured prod is visible.
- `app.run(debug=True, host="0.0.0.0")` → `HOST` env (default `127.0.0.1`)

### Request handling

- Added lat/lon range validation: `lat ∈ [-90,90]`, `lon ∈ [-180,180]` with 400 error code
- Changed analytics request from synchronous to fire-and-forget with timeout, failures logged
- Added configurable Open-Meteo timeout `UPSTREAM_TIMEOUT_MS` (default 5000 ms)
- Added LRU cache for Open-Meteo

### Database

- Added index on `user_preferences.location_id`. Production needs the equivalent
  one-line migration
- Changed sqlite connection lifecycle from per-request open/close to `node:sqlite` singleton, closed
  on `SIGTERM`/`SIGINT` graceful shutdown.
- `journal_mode=WAL` for future reader/writer concurrency
- `PRAGMA optimize` for planner stats refresh
- Other pragmas considered (cache_size, mmap_size, synchronous, busy_timeout, temp_store, query_only) deliberately omitted, the current workload doesn't justify them

### Operability

- `helmet` defaults; `express-rate-limit` at 120 req/min on `/api/v1/*`
- HTTP server timeouts: 30s request timeout, 5s keep-alive, 10s headers
- `/healthz` for the Docker `HEALTHCHECK`
- Autoseed on container start for easier testing, needs to be removed for prod
- Graceful shutdown drains HTTP, closes the DB; 10s hard-kill backstop
- Vitest suite covering score boundaries, validation gate, upstream timeout,
  analytics call, anonymous traffic
- Black-box conformance suite under `src/tests/conformance/`, runs against the Python and the Node port

### Preserved deliberately

- The dead `user_preferences` read in `/activity-score` — kept verbatim with a `TODO`
- No `ORDER BY` in distinct locations query matches the original
- Failing (and non-cached) Open-Meteo requests still return 500 to match the
  original Flask behavior, no retry logic in Python
- Brittle `f"{lat:.2f},{lon:.2f}"` location key — same rounding
- Anonymous traffic still posts to analytics with `user_id: null`

### Behavioral divergence

- `lat` / `lon` outside `[-90,90]` / `[-180,180]` now return 400 instead
  of 200 with null fields
- Repeat requests for the same coordinates within ~5 minutes return cached
  Open-Meteo data instead of re-fetching
- Analytics timestamp: Python `datetime.now().isoformat()` is local-time
  naive; Node `toISOString()` is UTC with `Z`

## AI tools used

- Claude Code (Anthropic) with Opus 4.7 (high): code review, port scaffolding, test cases,
  Dockerfile and Terraform boilerplate. Used as a pair-programming partner:
  audit and contract decisions were mine; the assistant accelerated the
  mechanical parts.
