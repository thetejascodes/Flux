# Flux

> _One order. Six services. Zero excuses._

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

✅ **All seven planned services are complete, and the full hardening test suite is done.** Gateway, Catalog, Inventory, Order, Payment, Delivery, and Notification are all built, dockerized, and proven working end-to-end, including the full choreographed saga (success and compensation paths), real Catalog-based pricing, geospatial nearest-driver assignment with live WebSocket tracking, event-driven customer notifications, and distributed tracing across every hop.

**Testing is fully closed out.** 70 automated tests pass across all 7 services, 5 real bugs were found and fixed in the process, every saga-facing gateway was refactored into named, independently testable handlers, and the full live saga — success and compensation paths — was re-verified end-to-end post-refactor, including a fixed idempotency-key scoping bug.

**Now in post-testing hardening.** With testing closed, the project has moved into a staged hardening and feature plan: closing documented reliability gaps first, then CI, then scale/observability proof, then a cart-based feature set (loyalty, reviews, recommendations, real payments). Two gaps are now closed or partly closed:

- **Dead-letter queue.** A RabbitMQ dead-letter exchange has been added and verified end-to-end for the Notification service — failed events are no longer silently discarded after one retry; they're preserved in `flux.events.dlq` with full payload and failure metadata intact. Rollout to the remaining event-consuming services (Inventory, Delivery, Payment, Order) is in progress.
- **Rate limiting.** The Gateway now enforces a Valkey-backed sliding-window limiter on `/api/auth/*` (10 requests per 60 seconds per client IP). It has been verified live: ten requests are evaluated normally, the rest are rejected with `429` before reaching any downstream logic, the window state is visible in Valkey, and the client recovers cleanly once the key expires. Verification of the `/orders` limiter and `Retry-After` / `X-RateLimit-*` response headers is still pending (see the [Roadmap](#roadmap)).

**Notification Service** listens to the same RabbitMQ exchange every other service publishes to — `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, `DeliveryAssigned` — and logs a customer-facing alert for each, idempotently (a unique constraint on `orderId` + notification type prevents duplicate alerts if an event is redelivered). It currently runs in stub mode (console + database log, same pattern as Gateway's own OTP stub mode) rather than sending real SMS; the Twilio integration itself is fully wired and ready, gated behind a single config flag, waiting only on a phone-number-resolution step that hasn't been built yet.

ADR-0001 through ADR-0005 are complete and accepted. **Phases 0 through 3 are fully closed**, and Phase 2's previously-open test-coverage gaps are now closed as part of the 70-test hardening pass. A frontend dashboard (optional, deprioritized), a case study write-up, and deployment remain, alongside the staged hardening/feature plan now underway.

---

## Table of Contents

- [What Makes This Different](#what-makes-this-different)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Services & Build Status](#services--build-status)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Testing](#testing)
- [Core Hard Problems](#core-hard-problems)
- [Roadmap](#roadmap)
- [Non-Goals (for v1)](#non-goals-for-v1)
- [Architecture Decisions](#architecture-decisions)

---

## What Makes This Different

- **No shared database.** Every service owns its data. No service reaches into another's tables.
- **Event-driven, not request-chained.** Services communicate through a message broker where consistency doesn't need to be immediate, not a chain of synchronous calls that collapses the moment one link is slow. Adding a new consumer — like Notification — required touching zero existing services; it just started listening to events already flowing.
- **Failure is a first-class case.** If payment fails after inventory succeeds, the system compensates — it doesn't leave the order in a broken half-state. Proven under genuine random failures, not just simulated on demand. Failed events themselves are no longer silently dropped either — a dead-letter queue now preserves anything that fails processing, instead of discarding it after one retry.
- **Protected at the edge.** The Gateway throttles abusive clients (for example, brute-force login attempts) with a Valkey-backed sliding window, rejecting excess traffic with a `429` before it can reach any downstream service.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-driver assignment by real distance calculation, and live delivery tracking over WebSocket.
- **Observable by design.** A single order's journey across every service it touches is visible as one connected trace, not five separate log streams.

---

## Architecture

Each service owns its own PostgreSQL database. Synchronous calls are used only for two cases: Gateway's authenticated proxy, and Order's single price lookup from Catalog at placement time. Everything else — order state changes, payment confirmations, delivery assignment, live position updates, customer notifications — flows as events through RabbitMQ, or in Delivery's case, out to the browser over WebSocket.

**The full proven saga, six services deep:**

`POST /orders` → Order looks up real Catalog pricing, writes `PENDING`, publishes `OrderCreated` → Inventory atomically reserves stock, publishes `InventoryReserved` → Order updates to `STOCK_RESERVED`, publishes `ChargePayment` with the real amount → Payment simulates a charge, publishes `PaymentSucceeded`/`PaymentFailed` → on success, Order finalizes to `CONFIRMED` and publishes `AssignDelivery` (reusing the warehouse Inventory already reserved against) → Delivery atomically claims the nearest available driver by real Haversine distance, publishes `DeliveryAssigned` → a background simulation moves that driver toward the warehouse every 5 seconds, broadcasting live position updates over WebSocket to any subscribed client, until the delivery reaches `DELIVERED`.

Running alongside all of this, entirely passively: **Notification** hears `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, and `DeliveryAssigned` the moment they're published, and logs a corresponding customer alert for each — with no code changes required in any of the services actually producing those events.

On payment failure: Order publishes `ReleaseReservation` instead, and Inventory releases the held stock — confirmed via direct database query, independently, more than once.

**Edge protection:** every request entering through the Gateway passes a rate-limiting middleware backed by Valkey before it is proxied. Requests over the limit are rejected with `429 Too Many Requests` and never touch Order, Payment, or any other service. See [Rate Limiting](#rate-limiting).

**Failure handling at the transport level:** every service's RabbitMQ consumer queues are now (or are being) bound to a shared dead-letter exchange, `flux.events.dlx`. A message that fails processing is retried once; if it fails again, it's routed — with its original payload, routing key, and failure metadata (`x-death` headers) intact — into `flux.events.dlq`, rather than being discarded. This is currently verified end-to-end for Notification, with the same wiring being rolled out to Inventory, Delivery, Payment, and Order.

See [ADR-0004](docs/adr/0004-saga-choreography.md) for the choreography-vs-orchestration reasoning, and [ADR-0005](docs/adr/0005-geospatial-routing.md) for the geospatial routing decision.

---

## Repository Structure

A single monorepo, not seven separate repos — each service is still fully independent (own dependencies, own database, own Dockerfile), just co-located for easier solo development.

```
flux/
├── docker-compose.yml
├── scripts/
│   └── init-databases.sh
├── docs/
│   └── adr/
├── services/
│   ├── gateway/        # auth (3 methods), routing, rate limiting  ✅ complete
│   ├── catalog/        # products, search                          ✅ complete
│   ├── inventory/      # stock, reservations, expiry job            ✅ complete
│   ├── order/          # saga participant, order lifecycle           ✅ complete
│   ├── payment/        # simulated charges, idempotency              ✅ complete
│   ├── delivery/       # nearest-driver assignment, live tracking   ✅ complete
│   └── notification/   # event-driven alerts                        ✅ complete
└── README.md
```

Each service follows the same shape:

```
services/<name>/
├── package.json, tsconfig.json, Dockerfile, .env, .env.docker
└── src/
    ├── app.ts, server.ts
    ├── common/{config, db, dto, middlewares, utils, events, tracing.ts}/
    └── modules/<feature>/
        ├── <feature>.routes.ts       # HTTP-facing services only
        ├── <feature>.controller.ts   # HTTP-facing services only
        ├── <feature>.service.ts
        ├── <feature>.gateway.ts      # saga event subscribers/publishers
        ├── <feature>.service.test.ts # Vitest suite, co-located with the service it covers
        └── dto/
```

`common/events/` (`connection.ts`, `publisher.ts`, `subscriber.ts`) wraps RabbitMQ behind a small generic API, with manual OpenTelemetry trace-context propagation built in — the publisher injects the active trace into message headers, the subscriber extracts it and wraps the handler so spans created downstream attach to the same trace, not a new disconnected one. `connection.ts` also asserts a shared dead-letter exchange (`flux.events.dlx`) and queue (`flux.events.dlq`) on connect, and `subscriber.ts`'s `assertQueue` call binds every consumer queue to it via the `x-dead-letter-exchange` argument, so a message that fails twice is preserved rather than dropped. `common/tracing.ts` is identical across all services and must load its own `dotenv/config` independently, since it runs before `server.ts` via Node's `--import` flag.

Delivery additionally has `common/websocket/websocket.ts` (a thin Socket.IO wrapper with per-order rooms) and `modules/deliveries/deliveries.tracking.ts` (the periodic simulation that moves an assigned driver toward the destination and broadcasts progress). Notification and Payment are both purely event-driven, with no HTTP routes at all beyond an internal `/health`.

Gateway's auth module is the one deliberate exception to the "one `.service.test.ts` per feature" convention above: its OTP flow splits `otp.service.ts` (rate-limiting, verification, session issuance) from `otp.ts` (the thin Twilio wrapper), each with its own dedicated suite — `otp.service.test.ts` and `otp.test.ts` — since mocking the Twilio call inside the service tests would leave the wrapper itself unverified. `auth.middleware.test.ts` covers the proxy-path token check separately again, since it's a request-handling concern rather than a token-issuance one.

---

## Services & Build Status

| Service          | Status      | Responsibility                                                                                                         |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Gateway**      | ✅ Complete | Auth (email/password, OTP, Google), request routing, token validation, Valkey-backed rate limiting                      |
| **Catalog**      | ✅ Complete | Products: create, get, list (filtered/paginated), update                                                               |
| **Inventory**    | ✅ Complete | Per-location stock, concurrency-safe reservations with timeout, background expiry job                                  |
| **Order**        | ✅ Complete | Order lifecycle, real Catalog pricing, drives the saga through Inventory, Payment, and Delivery                        |
| **Payment**      | ✅ Complete | Simulated charge outcome, idempotent via unique constraint on `idempotencyKey`                                         |
| **Delivery**     | ✅ Complete | Nearest-driver assignment (Haversine, atomically claimed), live position simulation, WebSocket broadcast per order     |
| **Notification** | ✅ Complete | Event-driven customer alerts on order lifecycle changes, idempotent per order+type, Twilio-ready but currently stubbed |

---

## Authentication

Gateway does **not** use full OpenID Connect — that's the right tool for an external identity provider serving multiple third-party clients, not a single product's internal services. Instead, Gateway supports three login methods, all converging on one shared token-issuing function:

- **Email/password** — bcrypt-hashed, standard signup/login
- **OTP (phone)** — Twilio-backed, rate-limited (3/hour, scoped per phone number), row-locked verification to prevent replay
- **Google OAuth** — implemented via direct HTTPS calls to Google's endpoints, no SDK

All three produce the same JWT (RS256, 15-minute expiry) + opaque refresh token pair. Refresh tokens are random values, hashed and stored server-side in a `sessions` table, and rotate on every use — so they can be revoked instantly, unlike a signed refresh JWT. The Gateway validates every incoming request's token before proxying it to a downstream service, and forwards the verified user's ID via an `x-user-id` header — services trust this header rather than re-authenticating every call. All three login paths, refresh rotation, and the proxy-path `isAuthenticated` middleware itself are covered by Vitest (see [Testing](#testing)). See [ADR-0002](docs/adr/0002-authentication-strategy.md) for the full reasoning.

---

## Rate Limiting

The Gateway throttles clients with a **Valkey-backed sliding-window limiter**, applied as middleware before requests are proxied downstream. Its main purpose is to make brute-force and credential-stuffing attacks against login impractical, and to shield internal services from bursts of abusive traffic.

| Route group   | Limit                     | Keyed by                                   | Status                         |
| ------------- | ------------------------- | ------------------------------------------ | ------------------------------ |
| `/api/auth/*` | 10 requests / 60 seconds  | Client IP (`ratelimit:auth:<ip>`)          | ✅ Verified live               |
| `/orders`     | 30 requests / 60 seconds  | To be confirmed (per user or per IP)       | ⏳ Pending verification        |

Note: OTP requests have their own separate, stricter limit (3/hour per phone number) enforced inside the OTP service. That is a different mechanism from the Gateway limiter described here.

### How it works

Each client gets one Valkey **sorted set** per route group. On every request the limiter:

1. Removes entries older than the window (trimmed by score, i.e. timestamp).
2. Records the new request as a member with a score equal to its epoch-millisecond timestamp. The member is the timestamp plus a random suffix, so two requests landing in the same millisecond are still counted separately.
3. Counts the set (`ZCARD`). If the count exceeds the limit, the request is rejected with `429` and the standard error envelope before it reaches any downstream logic.
4. Sets a key expiry equal to the window, so idle clients' keys disappear on their own instead of accumulating.

Because state lives in Valkey rather than process memory, the limit holds across restarts and across multiple Gateway instances.

### Behavior worth knowing

- **Rejected requests are recorded too.** In the live test, 12 requests produced a `ZCARD` of 12 (ten allowed, two rejected). A client that keeps hammering the endpoint therefore stays blocked until it stops for a full window. This is intentional for auth routes.
- **The key includes the IPv4-mapped IPv6 form.** Locally the key looks like `ratelimit:auth:::ffff:172.18.0.1`. The `::ffff:` prefix is how Node reports IPv4 clients on a dual-stack socket, and `172.18.0.1` is the Docker network gateway rather than the host machine's IP.
- **Error envelope.** A blocked request returns the same JSON shape as every other error:

  ```json
  {"status":"error","message":"Too many requests. Please try again later.","data":null}
  ```

### Verifying it yourself

Send twelve bad logins in a row (PowerShell, adjust the port if yours differs):

```powershell
1..12 | ForEach-Object {
  $resp = Invoke-WebRequest -Uri "http://localhost:4000/api/auth/login" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"test@test.com","password":"wrong"}' -SkipHttpErrorCheck
  Write-Host $resp.StatusCode
}
```

Expected: ten `401`s (wrong password, evaluated normally) followed by `429`s. Then inspect the window in Valkey right away, before the 60-second key expires:

```powershell
docker exec flux-valkey-1 valkey-cli --scan --pattern "ratelimit:*"
docker exec flux-valkey-1 valkey-cli ZCARD "ratelimit:auth:::ffff:172.18.0.1"
docker exec flux-valkey-1 valkey-cli TTL "ratelimit:auth:::ffff:172.18.0.1"
docker exec flux-valkey-1 valkey-cli ZRANGE "ratelimit:auth:::ffff:172.18.0.1" 0 -1 WITHSCORES
```

Use the exact key that `--scan` prints. You should see `ZCARD` of 10–12, a `TTL` at or below 60 that counts down, and one timestamped entry per request. After the TTL reaches zero, `--scan` returns nothing and the next request returns `401` again, with a fresh key at `ZCARD` 1.

### Known gaps

- `Retry-After` and `X-RateLimit-*` headers are **not yet sent** on `429` responses, so clients cannot tell how long to back off.
- The `/orders` limiter is not yet verified end-to-end. It needs an authenticated token, and it should be confirmed whether its key is per user or per IP.
- Behind a reverse proxy or load balancer in production, every user could appear to share the proxy's IP and one bucket. The Gateway needs `trust proxy` configured (for example `app.set('trust proxy', ...)` in Express) so the real client IP is read from `X-Forwarded-For`. Tracked under Phase 5.
- The limiter has been verified by manual live testing, not yet by an automated Vitest suite.

---

## Tech Stack

| Layer               | Technology                                                                       | Purpose                                                                              |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Language**        | TypeScript (strict, ESM/nodenext)                                                | Type-safe code across all services                                                  |
| **Runtime**         | Node.js 20, Express 5                                                            | Per-service HTTP APIs                                                               |
| **Database**        | PostgreSQL (one per service), Drizzle ORM                                        | Durable, service-owned data                                                         |
| **Cache / Locking** | Valkey (Redis-compatible)                                                        | Stock reservation TTLs, distributed locks, sliding-window rate limiting             |
| **Event Broker**    | RabbitMQ (topic exchange `flux.events`, dead-letter exchange `flux.events.dlx`)  | Async communication between services, with failure preservation                     |
| **Real-time**       | Socket.IO                                                                        | Live delivery position updates per order (room-scoped)                              |
| **Tracing**         | OpenTelemetry + Jaeger                                                           | End-to-end request tracing, manually propagated across RabbitMQ                     |
| **Auth**            | JWT (RS256), bcrypt, Twilio, Google OAuth2 (raw HTTPS)                           | Multi-method authentication                                                         |
| **Notifications**   | Twilio (stubbed pending phone-lookup wiring)                                     | Event-driven customer alerts                                                        |
| **Validation**      | Zod + BaseDto pattern                                                            | Schema-based DTO validation                                                         |
| **Testing**         | Vitest                                                                           | Unit and integration tests, co-located per service — 70 tests across all 7 services |
| **Dev Tooling**     | Docker Compose, tsc-watch                                                        | Local multi-service infrastructure                                                  |

---

## Quick Start

### 1. Start everything

```bash
docker compose up -d --build
docker compose ps
```

Confirm all containers (Postgres, Valkey, RabbitMQ, Jaeger, and all seven services) show `Up`.

### 2. Verify

```bash
curl http://localhost:4000/health
```

### 3. Exercise the full saga

```bash
curl -X POST http://localhost:4000/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"productId": "...", "warehouseId": "...", "quantity": 1}'
```

Watch `docker compose logs -f order inventory payment delivery notification` to see the event chain fire in real time, including Notification's alerts at each stage. Payment simulates a charge with a ~90% success rate; on success, the saga continues all the way to a driver assignment and live tracking.

### 4. Watch live delivery tracking

Connect a Socket.IO client to `http://localhost:4005`, emit `subscribe` with the order's ID, and listen for `delivery:update` events — a new one arrives roughly every 5 seconds until the delivery reaches `DELIVERED`.

### 5. Inspect a trace

Open `http://localhost:16686`, search under the `order` service, and open the most recent trace — it should span every service that order touched.

### 6. Inspect the dead-letter queue

Open the RabbitMQ management UI at `http://localhost:15672` (default `guest`/`guest`), go to **Queues**, and open `flux.events.dlq` — any event that failed processing twice will be sitting there with its original payload and an `x-death` header showing which queue and exchange it came from.

### 7. Watch the rate limiter

Send a burst of requests to `/api/auth/login` (see [Rate Limiting](#rate-limiting)) and inspect the resulting window with `valkey-cli --scan --pattern "ratelimit:*"`. Keys expire 60 seconds after the last request, so inspect them right after the burst.

Each service has two env files: `.env` (uses `localhost`, for local tooling) and `.env.docker` (uses the Docker service name as the hostname, for containers) — `docker compose` reads the latter automatically.

---

## Testing

Each service that owns non-trivial logic carries a Vitest suite, co-located next to the code it covers (`<feature>.service.test.ts`), run per-service with:

```bash
cd services/<name>
npm test
```

| Service          | Suites | Focus                                                                                 |
| ---------------- | ------ | --------------------------------------------------------------------------------------- |
| **Gateway**      | 5      | Email/password, OTP, Google OAuth, shared token issuance, proxy-path token validation |
| **Inventory**    | 1      | Zero-oversell concurrency, background expiry job                                      |
| **Payment**      | 1      | Idempotency, scoped by key vs. by order                                               |
| **Order**        | 1      | Real-pricing derivation, saga handler correctness across all four handlers            |
| **Delivery**     | 1      | Concurrent claim, transaction rollback, nearest-driver selection                      |
| **Notification** | 1      | Idempotency per order + notification type                                             |
| **Catalog**      | 1      | Product creation, lookup, filtering, pagination, updates, and price precision         |

**70 tests total across all 7 services, with 5 real bugs found and fixed** during the process — every saga-facing gateway was refactored into named, independently testable handlers along the way, and the full live saga (success and compensation paths) was re-verified end-to-end post-refactor, including a fixed idempotency-key scoping bug.

**Gateway** — the most thoroughly covered service, with five suites spanning all three login methods, the shared token machinery, and the request-facing side of auth: `auth.service.test.ts` (email/password + refresh — signup creates the user and email identity, duplicate emails are rejected, login returns both tokens and rejects bad credentials with the _same_ message as an unknown email to prevent account enumeration, refresh rotates and invalidates the previous token, and sessions receive the expected ~7-day expiry); `otp.service.test.ts` (rate-limiting at 3/hour scoped per phone number rather than globally, codes stored only as a hash — never in plaintext, new-user creation vs. existing-user reuse across repeat logins, and rejection of wrong, expired, already-consumed, and never-requested codes); `google-auth.service.test.ts` (the authorization URL's params, both of Google's HTTP calls succeeding and failing correctly, new-user creation vs. existing-identity reuse on repeat login, and that a failed token exchange or profile fetch never leaves a stray user row behind); `otp.test.ts` (the Twilio wrapper in isolation — stub mode logs to console and skips Twilio entirely, live mode sends the exact expected payload, and a Twilio-side failure propagates instead of being silently swallowed); and `auth.middleware.test.ts` (the `isAuthenticated` proxy-path check itself — a valid token sets `req.userId` and calls through cleanly, a missing or malformed `Authorization` header is rejected with a 401 rather than crashing, and a thrown verification error, such as an expired token, is correctly forwarded to the error handler instead of swallowed).

**Inventory** — concurrency safety is proven with a real 100-concurrent-request test against 1 unit of stock: exactly 1 reservation succeeds, 99 are cleanly rejected with a conflict, and none of the 99 fail for an unrelated reason. The same scenario is also exercised as a standalone load-test script (`scripts/load-test-reservation.ts`) that hits a running instance directly over HTTP, independent of the Vitest suite, so the guarantee is checked both at the unit level and against the real running service.

**Payment** — idempotency is proven with three cases: the same `idempotencyKey` called twice returns the same payment row and the same outcome rather than re-rolling a fresh charge result, while a different `idempotencyKey` against the same `orderId` correctly creates a second, independent payment row — confirming the unique constraint is scoped to the key, not the order, so a legitimate retry after a failed attempt isn't blocked. The event handler (`handleChargePayment`) itself has also been hardened: a validation failure now publishes a compensating `PaymentFailed` instead of silently dropping the event, and a thrown error from `chargePayment` is now caught and handled rather than left unguarded.

**Order** — pricing is tested against a mocked Catalog response, catching a real rounding bug where `.toFixed()` with no argument silently collapsed `99.98` to `100`; a Catalog-unreachable case confirms a clean error instead of an unhandled network exception; and all four saga handlers — `InventoryReserved`, `InventoryReservationFailed`, `PaymentSucceeded`, and `PaymentFailed` — are tested as actually-imported, directly-called functions (not a re-statement of their own inputs), confirming `InventoryReserved` correctly derives its idempotency key from the reservation, not the order, so a genuine retry after a released reservation isn't blocked.

**Catalog** — the 12-test suite covers product creation with exact two-decimal price storage, lookup of existing and nonexistent products, unfiltered and category-filtered listing, pagination across multiple pages, empty filter results, partial updates that preserve unspecified fields, price updates without floating-point corruption, and not-found handling for updates.

**Delivery** — the same concurrency pattern as Inventory is applied to driver assignment: 10 concurrent requests against 1 available driver yield exactly 1 success. A second test specifically proves the transaction boundary works — if the delivery record fails to insert after a driver is claimed, the claim itself rolls back, leaving the driver `AVAILABLE` rather than permanently stranded as `BUSY`. A third test seeds two drivers at different distances and confirms the nearer one is actually selected, not just the first one found.

**Notification** — idempotency is backed by a database-level unique constraint on `(orderId, type)`, confirmed both for repeated calls to the same event type and for a genuine redelivery of the same `PaymentSucceeded` event; a separate case confirms different notification types for the same order are correctly treated as independent, non-duplicate rows.

Run every service's suite from the repo root with:

```bash
for d in services/*/; do (cd "$d" && npm test); done
```

(PowerShell equivalent: `Get-ChildItem services -Directory | ForEach-Object { npm test --prefix $_.FullName }`)

### Reliability verification (beyond unit/integration tests)

**Dead-letter queue.** A RabbitMQ dead-letter exchange (`flux.events.dlx`) has been added so an event that fails processing twice is preserved — with its full original payload and failure metadata — in `flux.events.dlq`, instead of being silently discarded. This closes a gap previously documented in [ADR-0004](docs/adr/0004-saga-choreography.md). Verified end-to-end for Notification; rollout to Inventory, Delivery, Payment, and Order is in progress.

**Rate limiting (live-verified).** The Gateway's `/api/auth/login` limiter was exercised against the running Docker stack:

| Check                           | Result                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| 12 rapid bad logins             | Ten `401`s, then `429`s                                                                     |
| Key location                    | Valkey (`ratelimit:auth:<ip>`), not process memory                                          |
| `ZCARD` after the burst         | 12 (rejected requests are counted too)                                                      |
| `ZRANGE ... WITHSCORES`         | One timestamped entry per request, unique members, all within the same ~120 ms burst        |
| `TTL` after the last request    | 60, counting down                                                                           |
| After expiry                    | Key gone, next request returns `401` (not `429`), fresh window starts at `ZCARD` 1          |
| `429` response body             | Standard `{"status":"error","message":...,"data":null}` envelope                           |
| `429` response headers          | No `Retry-After` / `X-RateLimit-*` yet (tracked in the roadmap)                             |

Not yet covered: the `/orders` limiter, multi-IP isolation (one blocked client must not block another), and an automated Vitest suite for the limiter middleware.

---

## Core Hard Problems

1. **Zero overselling under concurrency** — proven under a real load test: 100 concurrent requests against 1 unit of stock, exactly 1 success. A background job auto-releases abandoned reservations, also proven live. _(Inventory — complete.)_
2. **The order saga** — order placed, inventory reserved, payment charged, delivery assigned, customer notified. Both the success and compensation paths are proven live in Docker, with real pricing and real geospatial assignment throughout, and distributed tracing showing every hop as one connected trace. A failed event is no longer a silent one either — it's preserved for inspection and replay rather than discarded. _(Order/Inventory/Payment/Delivery/Notification saga — complete; failure-preservation rollout in progress.)_
3. **Nearest-driver routing with live tracking** — the closest available driver to the shipping warehouse is selected using real Haversine distance calculation, claimed atomically to prevent double-booking under concurrent assignment, and their simulated movement is broadcast live to any client watching that order. Verified end-to-end with a continuous stream of position updates ending in a correct `DELIVERED` state. _(Delivery — complete.)_
4. **Abuse protection at the edge** — a distributed sliding-window limiter in Valkey rejects excess requests at the Gateway before they reach any service, and its state expires on its own so blocked clients recover automatically. _(Gateway — `/api/auth/*` verified; `/orders` pending.)_

---

## Roadmap

### Phase 0 — Foundation

- [x] Repo structure, Docker Compose infra
- [x] Gateway with full 3-method authentication
- [x] Catalog service, tested through Gateway's proxy

### Phase 1 — Inventory & Concurrency

- [x] Atomic reservation with timeout, proven zero-oversell under 100 concurrent requests (Vitest + standalone load test)
- [x] Background expiry job, verified live
- [x] [ADR-0003](docs/adr/0003-concurrency-approach.md) accepted

### Phase 2 — Order Saga

- [x] Order and Payment services built
- [x] Success and compensation paths proven live, multiple times
- [x] Real Catalog-based pricing, verified end-to-end (including a caught-and-fixed rounding bug)
- [x] Payment idempotency proven under Vitest (same key → same outcome; different key → independent charge)
- [x] Full test coverage across all four Order saga handlers
- [x] Payment's inbound event handler hardened against silently-dropped validation failures
- [x] Distributed tracing across the full saga, verified as one connected trace
- [x] [ADR-0004](docs/adr/0004-saga-choreography.md) accepted

### Phase 3 — Delivery & Routing

- [x] Warehouse/driver/delivery model
- [x] Nearest-available-driver assignment via Haversine, atomically claimed
- [x] Live delivery tracking over WebSocket, backed by a real simulation job
- [x] [ADR-0005](docs/adr/0005-geospatial-routing.md) accepted

### Phase 4 — Presentation

- [x] Notification Service — event-driven, idempotent, Twilio-ready (stubbed pending phone lookup)
- [x] Gateway test suite completed across all three login methods (email/password, OTP, Google OAuth), refresh rotation, and the proxy-path auth middleware
- [x] Catalog test suite completed: 12 tests covering product creation, lookup, filtering, pagination, updates, and price precision
- [ ] Minimal dashboard showing live order flow and delivery tracking (optional, deprioritized)
- [ ] Case study write-up

### Phase 4.5 — Hardening

- [x] Full automated test suite: 70 tests across all 7 services, 5 real bugs found and fixed
- [x] Dead-letter queue for RabbitMQ (Notification verified end-to-end; Inventory, Delivery, Payment, Order in progress)
- [x] Rate limiting at Gateway on `/api/auth/*` — Valkey-backed sliding window, 10 requests / 60s per IP, verified live (limit, blocking, TTL expiry, recovery)
- [ ] Rate limiting on `/orders` (30 / 60s) — verify live with an authenticated token and confirm whether the key is per user or per IP
- [ ] `Retry-After` and `X-RateLimit-Limit` / `-Remaining` / `-Reset` headers on `429` responses
- [ ] Multi-IP isolation check for the limiter (one blocked client must not block another)
- [ ] Automated Vitest coverage for the rate-limiter middleware
- [ ] Remove `X-Powered-By: Express` from responses (`app.disable('x-powered-by')` or `helmet()`)
- [ ] Role enforcement (Gateway forwards `x-user-role`; Catalog gates admin-only writes)
- [ ] Real health checks (`/health` pings DB + RabbitMQ, returns 503 if either is down)
- [ ] CI pipeline per service (GitHub Actions: lint → build → test, against real Postgres + RabbitMQ)
- [ ] README build-status badge
- [ ] Multi-instance proof + advisory-lock fix for background jobs (e.g. `docker compose up -d --scale inventory=3`)
- [ ] Structured logging (pino) with OpenTelemetry trace correlation

### Phase 5 — Deployment

- [ ] Managed infra swap (Neon, Upstash, CloudAMQP)
- [ ] Production env vars, CI/CD per service (built in Phase 4.5, deployed here)
- [ ] Configure Express `trust proxy` on the Gateway so rate limiting keys on the real client IP behind a load balancer
- [ ] Network isolation — remove public ports from every internal service except Gateway
- [ ] Post-deploy verification of the full saga in production

---

## Non-Goals (for v1)

- Seller/marketplace onboarding
- Full admin back-office and analytics dashboards
- Recommendation engine / personalization
- Native mobile apps
- Internationalization / multi-currency

---

## Architecture Decisions

- [ADR-0001: Database-per-service vs shared database](docs/adr/0001-database-selection.md)
- [ADR-0002: Authentication strategy](docs/adr/0002-authentication-strategy.md)
- [ADR-0003: Concurrency strategy for inventory reservation](docs/adr/0003-concurrency-approach.md)
- [ADR-0004: Saga pattern — choreography vs orchestration](docs/adr/0004-saga-choreography.md)
- [ADR-0005: Geospatial routing approach](docs/adr/0005-geospatial-routing.md)

---

_A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose._
