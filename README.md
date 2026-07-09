# URL Shortener

A small REST API that shortens URLs, redirects short codes to their target, and
reports per-link click statistics. Built with **TypeScript + Express** and
backed by **SQLite**.

---

## Contents

- [Quick start](#quick-start)
- [API](#api)
- [Running with Docker](#running-with-docker)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Tradeoffs & known limitations](#tradeoffs--known-limitations)
- [What's next](#whats-next)
- [Project layout](#project-layout)

---

## Quick start

Requires Node.js ≥ 20.

```bash
make install      # npm ci
make run          # build + start on http://localhost:3000
# or, for hot-reload during development:
make dev
```

Then:

```bash
curl -X POST http://localhost:3000/shorten \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/a/very/long/link"}'
# -> {"short_code":"aB3xK9p","short_url":"http://localhost:3000/aB3xK9p"}

curl -i http://localhost:3000/aB3xK9p          # 302 -> Location: https://example.com/...
curl http://localhost:3000/stats/aB3xK9p       # total hits + 30-day breakdown
```

> **Windows note:** if `make` isn't available, use the underlying npm scripts
> directly — `npm ci`, `npm run build`, `npm start`, `npm test`.

### Configuration

All settings come from environment variables (see [`.env.example`](.env.example)):

| Variable   | Default                   | Purpose                                              |
| ---------- | ------------------------- | ---------------------------------------------------- |
| `PORT`     | `3000`                    | HTTP listen port.                                    |
| `BASE_URL` | `http://localhost:$PORT`  | Origin used to build the returned `short_url`.       |
| `DB_PATH`  | `./data/urls.db`          | SQLite file path (`/data/urls.db` in Docker).        |

---

## API

### `POST /shorten`

Create a short code for a URL.

**Request**

```json
{ "url": "https://example.com/page" }
```

**Response** — `201 Created`

```json
{ "short_code": "aB3xK9p", "short_url": "http://localhost:3000/aB3xK9p" }
```

Returns `400` if `url` is missing, not a string, malformed, longer than 2048
characters, or not an `http`/`https` URL.

### `GET /:short_code`

Redirects to the original URL and records a hit.

- `302 Found` with a `Location` header on success.
- `404 Not Found` (JSON) if the code is unknown.

### `GET /stats/:short_code`

**Response** — `200 OK`

```json
{
  "short_code": "aB3xK9p",
  "original_url": "https://example.com/page",
  "created_at": "2026-07-09T10:00:00Z",
  "total_hits": 42,
  "daily": [
    { "date": "2026-06-10", "hits": 0 },
    { "date": "2026-06-11", "hits": 3 },
    "... 30 entries total, oldest first, ending today ..."
  ]
}
```

- `daily` always contains exactly 30 entries (last 30 UTC days, oldest first),
  with zero-filled gaps so the series is dense and chart-ready.
- `total_hits` is **all-time**, so for links older than 30 days it can exceed
  the sum of `daily`.
- `404` if the code is unknown.

### `GET /health`

`200 OK` → `{ "status": "ok" }`. Used by the Docker health check.

---

## Running with Docker

The image builds and runs the service end-to-end with no external services.

```bash
make docker-build && make docker-run
# or:
docker compose up --build
```

The service listens on `:3000`. The SQLite database lives at `/data/urls.db`
inside the container; both `docker-run` and Compose mount a named volume there
so data survives restarts.

---

## Testing

```bash
make test          # npm ci && vitest run  (unit + integration)
make test-coverage # with a coverage report
```

The suite (via [Vitest](https://vitest.dev) + [supertest](https://github.com/ladjs/supertest)) has two layers:

- **Unit** — short-code generation (length/charset/collision-resistance/validation),
  URL validation (scheme allow-list, normalization, length/type guards), and the
  stats date-series math (UTC bucketing, 30-day window, zero-filling).
- **Store & integration** — the `UrlStore` against a real in-memory SQLite
  database (daily aggregation, all-time vs. windowed totals), and the full HTTP
  surface through the Express app (create → redirect → stats, plus every error
  path and the health/root endpoints).

Tests run against an in-memory database (`:memory:`), so they're hermetic and
leave nothing on disk.

---

## Design decisions

**TypeScript + Express.** A minimal, widely understood stack that keeps the code
readable and the dependency surface small. Types catch mistakes at the
boundaries (request bodies, DB rows) without ceremony.

**SQLite (via `better-sqlite3`).** For this workload SQLite is the right amount
of database:

- **Zero-config & self-contained** — no separate service to provision, so the
  Dockerfile runs the whole system end-to-end from a single image. That directly
  serves the "builds and runs end-to-end" requirement.
- **Correct & durable** — real SQL with a `UNIQUE` constraint on `short_code`,
  a foreign key from clicks to URLs, and ACID transactions. WAL mode is enabled
  for better read/write concurrency.
- **`better-sqlite3` is synchronous**, which suits an in-process embedded DB:
  no pool, no async plumbing, and each query is a single fast call. This keeps
  the data-access layer simple and easy to reason about.

It scales comfortably to millions of rows and thousands of reads/sec on one
node — well beyond what a take-home needs — and the `UrlStore` abstraction keeps
the door open to swapping in Postgres later (see below).

**Click storage: pre-aggregated daily counters.** Instead of one row per hit,
each redirect performs an UPSERT that increments a `(url_id, day)` counter.
This makes storage grow with *active days per link* rather than *total traffic*,
and turns the stats query into a tiny indexed range scan. The `total_hits`
figure is a `SUM` over those counters.

**Random base62 short codes.** Codes are 7 random base62 characters
(keyspace 62⁷ ≈ 3.5 trillion) drawn from a CSPRNG. Random (rather than
sequential-id-encoded) codes are **not enumerable**, so you can't walk the
namespace by incrementing a counter. Collisions are handled by the `UNIQUE`
constraint plus a bounded retry loop.

**Dependency injection at the seams.** `createDb(path)` → `UrlStore(db)` →
`createApp(store, config)`. Nothing reaches for a global connection, so tests
build the whole app over an in-memory database and the composition root
(`server.ts`) is the only place that touches the environment.

**Safety.** The redirect endpoint sends users straight to a stored value, so
validation rejects everything except absolute `http`/`https` URLs — blocking
`javascript:`, `data:`, `file:`, etc. Request bodies are size-capped and
`x-powered-by` is disabled.

---

## Tradeoffs & known limitations

- **No URL de-duplication.** Shortening the same URL twice yields two codes.
  This keeps per-code stats unambiguous; de-duping would need a decision about
  whether stats are per-URL or per-code. Easy to add with a lookup + unique
  index on `original_url`.
- **Daily granularity only.** We store per-day counts, not per-hit rows, so
  there's no hourly breakdown, referrer, or geo data. That was a deliberate
  storage/simplicity tradeoff for the required stats.
- **UTC day buckets.** Days are bucketed in UTC for determinism; a viewer in a
  far-off timezone sees UTC-day boundaries, not their local ones.
- **Single-node datastore.** SQLite is embedded, so this runs as one instance.
  Horizontal scaling would mean moving to a networked DB (below). The named
  Docker volume keeps data durable across restarts but not across hosts.
- **`BASE_URL` is static config**, not derived per-request from the `Host`
  header — simpler and predictable, but you set it explicitly per environment.
- **No auth or rate limiting** on `/shorten` — out of scope here, noted below.

---

## What's next

Given more time, in rough priority order:

1. **Rate limiting & abuse controls** on `/shorten` (per-IP), plus optional
   allow/deny lists — the first thing a public shortener needs.
2. **Postgres adapter.** Extract a `Store` interface (the `UrlStore` surface is
   already small) and add a Postgres implementation for multi-node deployments;
   swap the daily UPSERT for the same pattern on a real server.
3. **Optional URL de-duplication** behind a flag, returning the existing code
   for a repeat URL.
4. **Richer analytics** — opt-in per-hit events (timestamp, referrer, coarse
   geo) in a separate table, with the daily counters kept as the fast path.
5. **Custom/vanity codes** and **expiring links** (TTL + a cleanup job).
6. **OpenAPI spec** and generated client, plus structured logging and metrics.
7. **CI** running `make test`, lint, and a Docker build on every push.

---

## Project layout

```
src/
  config.ts            env-driven configuration
  server.ts            composition root: db -> store -> app -> listen
  app.ts               Express wiring (middleware, router, error handling)
  routes.ts            route handlers + 404/error middleware
  db/index.ts          SQLite connection, pragmas, schema/migrations
  store/urlStore.ts    data-access layer (prepared statements)
  lib/
    shortCode.ts       base62 code generation
    validation.ts      URL validation & normalization
    stats.ts           UTC day math + dense daily series
tests/
  unit/                shortCode, validation, stats, urlStore
  integration/         full HTTP surface via supertest
Dockerfile             multi-stage build, non-root, healthcheck
docker-compose.yml     one-command run with a persistent volume
Makefile               install / build / test / run / docker targets
```
