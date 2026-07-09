# API Reference

Base URL (local default): `http://localhost:8787`

All responses are JSON except the redirect endpoint, which responds with a
`302` and a `Location` header. Errors share a single shape:

```json
{ "error": "human-readable message" }
```

Interactive docs are served at [`/docs`](http://localhost:8787/docs) (Swagger UI)
and the raw machine-readable spec at [`/openapi.json`](http://localhost:8787/openapi.json).

| Method | Path                  | Purpose                                   | Success |
| ------ | --------------------- | ----------------------------------------- | ------- |
| POST   | `/shorten`            | Create a short code for a URL             | `201`   |
| GET    | `/{short_code}`       | Redirect to the original URL (records hit)| `302`   |
| GET    | `/stats/{short_code}` | Total hits + 30-day daily breakdown       | `200`   |
| GET    | `/health`             | Liveness probe                            | `200`   |
| GET    | `/openapi.json`       | OpenAPI 3 spec                            | `200`   |
| GET    | `/docs`               | Swagger UI                                | `200`   |

---

## POST /shorten

Create a short code for an absolute `http`/`https` URL.

**Request body**

| Field | Type   | Required | Constraints                                  |
| ----- | ------ | -------- | -------------------------------------------- |
| `url` | string | yes      | Absolute `http`/`https` URL, ≤ 2048 chars    |

```bash
curl -X POST http://localhost:8787/shorten \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/a/very/long/link"}'
```

**`201 Created`**

```json
{
  "short_code": "aB3xK9p",
  "short_url": "http://localhost:8787/aB3xK9p"
}
```

**`400 Bad Request`** — returned when `url` is missing, not a string, empty,
malformed, not `http`/`https`, or longer than 2048 characters.

```json
{ "error": "`url` must use the http or https scheme" }
```

> Shortening the same URL twice returns **two different codes** — the service
> does not de-duplicate (see the README's tradeoffs section).

---

## GET /{short_code}

Resolve a short code: records a hit for the current UTC day and redirects.

```bash
curl -i http://localhost:8787/aB3xK9p
```

**`302 Found`**

```
HTTP/1.1 302 Found
Location: https://example.com/a/very/long/link
```

**`404 Not Found`**

```json
{ "error": "short code not found" }
```

---

## GET /stats/{short_code}

Return all-time hits and a dense per-day breakdown for the last 30 UTC days.

```bash
curl http://localhost:8787/stats/aB3xK9p
```

**`200 OK`**

```json
{
  "short_code": "aB3xK9p",
  "original_url": "https://example.com/a/very/long/link",
  "created_at": "2026-07-09T10:00:00Z",
  "total_hits": 42,
  "daily": [
    { "date": "2026-06-10", "hits": 0 },
    { "date": "2026-06-11", "hits": 3 },
    "... 30 entries total, oldest first, ending today ..."
  ]
}
```

| Field          | Type    | Notes                                                               |
| -------------- | ------- | ------------------------------------------------------------------- |
| `short_code`   | string  | The code that was looked up.                                        |
| `original_url` | string  | The normalized URL it points to.                                    |
| `created_at`   | string  | ISO-8601 UTC timestamp of creation.                                 |
| `total_hits`   | integer | **All-time** total. Can exceed the sum of `daily` for old links.    |
| `daily`        | array   | Exactly 30 `{ date, hits }` entries, oldest first, zero-filled.     |

**`404 Not Found`**

```json
{ "error": "short code not found" }
```

---

## GET /health

```bash
curl http://localhost:8787/health
```

**`200 OK`**

```json
{ "status": "ok" }
```

---

## Status codes at a glance

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 200  | OK (stats, health, docs, spec).                                |
| 201  | Short link created.                                            |
| 302  | Redirect to the original URL.                                  |
| 400  | Invalid request body / URL.                                    |
| 404  | Unknown short code, or unmatched route.                        |
| 500  | Unexpected server error (logged server-side, opaque to client).|
