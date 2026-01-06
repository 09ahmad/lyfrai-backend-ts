# Lyftr AI — Webhook API (Bun + TypeScript + Express)

A Bun-based implementation of the Lyftr webhook ingestion service, built with **Express** (running on Bun) and Bun’s built-in **bun:sqlite** driver for SQLite. It fulfills the spec with HMAC-validated webhook ingestion, SQLite persistence, pagination, stats, health probes, Prometheus-style metrics, structured JSON logs, and Docker Compose packaging.

## Prerequisites
- Bun 1.2+ (`bun --version`)
- Docker + Docker Compose
- Build tooling for `better-sqlite3` (node-gyp toolchain; already vendored as dev deps)

## Quickstart (local)
```bash
bun install
WEBHOOK_SECRET="testsecret" DATABASE_URL="sqlite:////data/app.db" bun run app/main.ts
# or use the Make targets below
```

## Make targets
- `make up` – `docker compose up -d --build`
- `make down` – `docker compose down -v`
- `make logs` – `docker compose logs -f api`
- `make test` – `bun test`

## Endpoints
- `GET /health/live` – always 200 when the app is running.
- `GET /health/ready` – 200 only when DB is reachable and `WEBHOOK_SECRET` is set; 503 otherwise.
- `POST /webhook` – ingest WhatsApp-like messages exactly once (Express `raw` body for HMAC). Requires `X-Signature` HMAC-SHA256 hex of the raw body using `WEBHOOK_SECRET`. Valid payload:
  ```json
  { "message_id": "m1", "from": "+919876543210", "to": "+14155550100", "ts": "2025-01-15T10:00:00Z", "text": "Hello" }
  ```
  - 401 `{"detail":"invalid signature"}` on bad/missing signature.
  - 422 on schema validation errors (Zod) or bad JSON.
  - 200 `{"status":"ok"}` on first insert and on duplicates (idempotent).
- `GET /messages` – paginated, ordered `ts ASC, message_id ASC`. Query params: `limit` (1–100, default 50), `offset` (default 0), `from`, `since` (ISO UTC), `q` (case-insensitive substring on `text`). Response includes `data`, `total`, `limit`, `offset`.
- `GET /stats` – analytics summary:
  ```json
  {
    "total_messages": 123,
    "senders_count": 10,
    "messages_per_sender": [{ "from": "+919876543210", "count": 50 }],
    "first_message_ts": "...",
    "last_message_ts": "..."
  }
  ```
- `GET /metrics` – Prometheus exposition with `http_requests_total`, `webhook_requests_total`, and latency buckets.

# Lyftr AI — Webhook API (Bun + TypeScript + Express)

A Bun-based implementation of the Lyftr webhook ingestion service, built with Express (running on Bun) and Bun’s built-in `bun:sqlite` driver for SQLite. Features:

- HMAC-validated webhook ingestion
- SQLite persistence with idempotency
- Pagination, stats, and Prometheus-style metrics
- Health probes and a Docker Compose setup for local testing

## Prerequisites

- Bun (1.2+ recommended)
- Docker + Docker Compose (for containerized runs)

## Quickstart (local)

1. Install dependencies:

```bash
bun install
```

2. Run locally using a project-local SQLite file (recommended for development):

```bash
WEBHOOK_SECRET="testsecret" DATABASE_URL="sqlite:./data/app.db" bun run app/main.ts
```

Notes:
- Prefer `sqlite:./data/app.db` for local development so the DB lives inside the project `data/` folder.

## Make targets

- `make up` — start containers: `docker compose up -d --build`
- `make down` — stop and remove containers: `docker compose down -v`
- `make logs` — follow API logs: `docker compose logs -f api`
- `make test` — run unit tests: `bun test`
- `make run` — run the app locally using env vars (same as Quickstart)

## Endpoints (summary)

- `GET /health/live` — 200 when the process is running.
- `GET /health/ready` — 200 only when DB is reachable and `WEBHOOK_SECRET` is set; 503 otherwise.
- `POST /webhook` — ingest messages (uses raw body for HMAC). Requires `X-Signature` HMAC-SHA256 hex of the raw body using `WEBHOOK_SECRET`.
- `GET /messages` — paginated listing (`limit`, `offset`, `from`, `since`, `q`).
- `GET /stats` — aggregated stats.
- `GET /metrics` — Prometheus exposition.

See the code for exact payload/response contracts.

## Configuration (12-factor via env)

- `WEBHOOK_SECRET` (required for readiness)
- `DATABASE_URL` (default for Docker: `sqlite:////data/app.db`, recommended local dev: `sqlite:./data/app.db`)
- `LOG_LEVEL` (`INFO` | `DEBUG`, default `INFO`)

## Running with Docker Compose

Set the required env and bring the service up:

```bash
export WEBHOOK_SECRET="testsecret"
export DATABASE_URL="sqlite:////data/app.db"
make up
# wait a few seconds and verify readiness
curl -sf http://localhost:8000/health/ready
```

Notes about the Docker setup:
- The `Dockerfile` installs `curl` so the container healthcheck works.
- The compose file maps a named volume to `/data` so the SQLite file persists between runs.

## Development helpers

- `scripts/check_db.ts` — small script that calls `initDb()` with `process.env.DATABASE_URL` and pings the DB. Use it for quick validation without starting the whole app.

## Tests

```bash
bun test
```

## Troubleshooting

- If you get `SQLiteError: unable to open database file`, make sure the parent directory exists and the path in `DATABASE_URL` is writable by the runtime (for local dev use `sqlite:./data/app.db`).
- On Windows/WSL, prefer the project-relative `sqlite:./data/app.db` to avoid cross-OS path issues.

## Contact

If you'd like, I can add CI checks, a CI health-check job that runs `scripts/check_db.ts`, or expand integration tests that exercise the full HTTP API.

## Constraints & Notes

- SQLite only: the application uses Bun's `bun:sqlite` driver and stores data in a single SQLite file. There is no other database backend in this repository.
- All configuration is via environment variables (12-factor): `WEBHOOK_SECRET`, `DATABASE_URL`, and `LOG_LEVEL`.
- Recommended local `DATABASE_URL`: `sqlite:./data/app.db`. Docker uses `sqlite:////data/app.db` (absolute path inside container volume).

## Semantics & Verification

The repository implements the requested semantics in these files:

- `app/storage.ts` — database initialization, table creation, and queries (ensures idempotent inserts via `message_id` PRIMARY KEY).
- `app/security.ts` — HMAC verification for `POST /webhook` using `WEBHOOK_SECRET` and constant-time comparison.
- `app/main.ts` — Express route wiring for `/webhook`, `/messages`, `/stats`, `/metrics`, and health endpoints and readiness checks.

How to verify behavior locally:

1. Run unit tests: `bun test` (includes HMAC unit tests).
2. Run the app locally: `make run` (or use the env line shown in Quickstart). Ensure `DATABASE_URL=sqlite:./data/app.db` for a file-backed DB.
3. Use `scripts/check_db.ts` to verify DB initialization without running the server.
4. For end-to-end verification, send a correctly-signed `POST /webhook` request and observe:
  - 200 on first insert, 200 on duplicates (idempotent),
  - 401 on missing/invalid `X-Signature`,
  - 422 on invalid payload according to schema.

The codebase contains a small test suite and `scripts/check_db.ts` to help automate these checks.

## Setup Used

VSCode + Copilot + occasional ChatGPT prompts

