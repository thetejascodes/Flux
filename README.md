# Flux

> *One order. Six services. Zero excuses.*

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

✅ **All seven planned services are complete.** Gateway, Catalog, Inventory, Order, Payment, Delivery, and Notification are all built, dockerized, and proven working end-to-end, including the full choreographed saga (success and compensation paths), real Catalog-based pricing, geospatial nearest-driver assignment with live WebSocket tracking, event-driven customer notifications, and distributed tracing across every hop.

**Notification Service is the latest addition.** It listens to the same RabbitMQ exchange every other service publishes to — `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, `DeliveryAssigned` — and logs a customer-facing alert for each, idempotently (a unique constraint on `orderId` + notification type prevents duplicate alerts if an event is redelivered). It currently runs in stub mode (console + database log, same pattern as Gateway's own OTP stub mode) rather than sending real SMS; the Twilio integration itself is fully wired and ready, gated behind a single config flag, waiting only on a phone-number-resolution step that hasn't been built yet.

ADR-0001 through ADR-0005 are complete and accepted. **Phases 0 through 3 are fully closed.** A frontend dashboard, a case study write-up, and deployment are the remaining work.

---

## Table of Contents

- [What Makes This Different](#what-makes-this-different)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Services & Build Status](#services--build-status)
- [Authentication](#authentication)
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
- **Failure is a first-class case.** If payment fails after inventory succeeds, the system compensates — it doesn't leave the order in a broken half-state. Proven under genuine random failures, not just simulated on demand.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-driver assignment by real distance calculation, and live delivery tracking over WebSocket.
- **Observable by design.** A single order's journey across every service it touches is visible as one connected trace, not five separate log streams.

---

## Architecture

Each service owns its own PostgreSQL database. Synchronous calls are used only for two cases: Gateway's authenticated proxy, and Order's single price lookup from Catalog at placement time. Everything else — order state changes, payment confirmations, delivery assignment, live position updates, customer notifications — flows as events through RabbitMQ, or in Delivery's case, out to the browser over WebSocket.

**The full proven saga, six services deep:**

`POST /orders` → Order looks up real Catalog pricing, writes `PENDING`, publishes `OrderCreated` → Inventory atomically reserves stock, publishes `InventoryReserved` → Order updates to `STOCK_RESERVED`, publishes `ChargePayment` with the real amount → Payment simulates a charge, publishes `PaymentSucceeded`/`PaymentFailed` → on success, Order finalizes to `CONFIRMED` and publishes `AssignDelivery` (reusing the warehouse Inventory already reserved against) → Delivery atomically claims the nearest available driver by real Haversine distance, publishes `DeliveryAssigned` → a background simulation moves that driver toward the warehouse every 5 seconds, broadcasting live position updates over WebSocket to any subscribed client, until the delivery reaches `DELIVERED`.

Running alongside all of this, entirely passively: **Notification** hears `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, and `DeliveryAssigned` the moment they're published, and logs a corresponding customer alert for each — with no code changes required in any of the services actually producing those events.

On payment failure: Order publishes `ReleaseReservation` instead, and Inventory releases the held stock — confirmed via direct database query, independently, more than once.

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
│   ├── gateway/        # auth (3 methods), routing            ✅ complete
│   ├── catalog/        # products, search                     ✅ complete
│   ├── inventory/      # stock, reservations, expiry job       ✅ complete
│   ├── order/          # saga participant, order lifecycle      ✅ complete
│   ├── payment/        # simulated charges, idempotency         ✅ complete
│   ├── delivery/       # nearest-driver assignment, live tracking ✅ complete
│   └── notification/   # event-driven alerts                   ✅ complete
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

`common/events/` (`connection.ts`, `publisher.ts`, `subscriber.ts`) wraps RabbitMQ behind a small generic API, with manual OpenTelemetry trace-context propagation built in — the publisher injects the active trace into message headers, the subscriber extracts it and wraps the handler so spans created downstream attach to the same trace, not a new disconnected one. `common/tracing.ts` is identical across all services and must load its own `dotenv/config` independently, since it runs before `server.ts` via Node's `--import` flag.

Delivery additionally has `common/websocket/websocket.ts` (a thin Socket.IO wrapper with per-order rooms) and `modules/deliveries/deliveries.tracking.ts` (the periodic simulation that moves an assigned driver toward the destination and broadcasts progress). Notification and Payment are both purely event-driven, with no HTTP routes at all beyond an internal `/health`.

---

## Services & Build Status

| Service | Status | Responsibility |
| --- | --- | --- |
| **Gateway** | ✅ Complete | Auth (email/password, OTP, Google), request routing, token validation |
| **Catalog** | ✅ Complete | Products: create, get, list (filtered/paginated), update |
| **Inventory** | ✅ Complete | Per-location stock, concurrency-safe reservations with timeout, background expiry job |
| **Order** | ✅ Complete | Order lifecycle, real Catalog pricing, drives the saga through Inventory, Payment, and Delivery |
| **Payment** | ✅ Complete | Simulated charge outcome, idempotent via unique constraint on `idempotencyKey` |
| **Delivery** | ✅ Complete | Nearest-driver assignment (Haversine, atomically claimed), live position simulation, WebSocket broadcast per order |
| **Notification** | ✅ Complete | Event-driven customer alerts on order lifecycle changes, idempotent per order+type, Twilio-ready but currently stubbed |

---

## Authentication

Gateway does **not** use full OpenID Connect — that's the right tool for an external identity provider serving multiple third-party clients, not a single product's internal services. Instead, Gateway supports three login methods, all converging on one shared token-issuing function:

- **Email/password** — bcrypt-hashed, standard signup/login
- **OTP (phone)** — Twilio-backed, rate-limited (3/hour), row-locked verification to prevent replay
- **Google OAuth** — implemented via direct HTTPS calls to Google's endpoints, no SDK

All three produce the same JWT (RS256, 15-minute expiry) + opaque refresh token pair. Refresh tokens are random values, hashed and stored server-side in a `sessions` table, and rotate on every use — so they can be revoked instantly, unlike a signed refresh JWT. The Gateway validates every incoming request's token before proxying it to a downstream service, and forwards the verified user's ID via an `x-user-id` header — services trust this header rather than re-authenticating every call. See [ADR-0002](docs/adr/0002-authentication-strategy.md) for the full reasoning.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Language** | TypeScript (strict, ESM/nodenext) | Type-safe code across all services |
| **Runtime** | Node.js 20, Express 5 | Per-service HTTP APIs |
| **Database** | PostgreSQL (one per service), Drizzle ORM | Durable, service-owned data |
| **Cache / Locking** | Valkey (Redis-compatible) | Stock reservation TTLs, distributed locks |
| **Event Broker** | RabbitMQ (topic exchange, `flux.events`) | Async communication between services |
| **Real-time** | Socket.IO | Live delivery position updates per order (room-scoped) |
| **Tracing** | OpenTelemetry + Jaeger | End-to-end request tracing, manually propagated across RabbitMQ |
| **Auth** | JWT (RS256), bcrypt, Twilio, Google OAuth2 (raw HTTPS) | Multi-method authentication |
| **Notifications** | Twilio (stubbed pending phone-lookup wiring) | Event-driven customer alerts |
| **Validation** | Zod + BaseDto pattern | Schema-based DTO validation |
| **Testing** | Vitest | Unit and integration tests, co-located per service |
| **Dev Tooling** | Docker Compose, tsc-watch | Local multi-service infrastructure |

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

Each service has two env files: `.env` (uses `localhost`, for local tooling) and `.env.docker` (uses the Docker service name as the hostname, for containers) — `docker compose` reads the latter automatically.

---

## Testing

Each service that owns non-trivial logic carries a Vitest suite, co-located next to the code it covers (`<feature>.service.test.ts`), run per-service with:

```bash
cd services/<name>
npm test
```

**Inventory** — concurrency safety is proven with a real 100-concurrent-request test against 1 unit of stock: exactly 1 reservation succeeds, 99 are cleanly rejected with a conflict, and none of the 99 fail for an unrelated reason. The same scenario is also exercised as a standalone load-test script (`scripts/load-test-reservation.ts`) that hits a running instance directly over HTTP, independent of the Vitest suite, so the guarantee is checked both at the unit level and against the real running service.

**Payment** — idempotency is proven with three cases: the same `idempotencyKey` called twice returns the same payment row and the same outcome rather than re-rolling a fresh charge result, while a different `idempotencyKey` against the same `orderId` correctly creates a second, independent payment row — confirming the unique constraint is scoped to the key, not the order, so a legitimate retry after a failed attempt isn't blocked.

Run every service's suite from the repo root with:

```bash
for d in services/*/; do (cd "$d" && npm test); done
```

(PowerShell equivalent: `Get-ChildItem services -Directory | ForEach-Object { npm test --prefix $_.FullName }`)

---

## Core Hard Problems

1. **Zero overselling under concurrency** — proven under a real load test: 100 concurrent requests against 1 unit of stock, exactly 1 success. A background job auto-releases abandoned reservations, also proven live. *(Inventory — complete.)*
2. **The order saga** — order placed, inventory reserved, payment charged, delivery assigned, customer notified. Both the success and compensation paths are proven live in Docker, with real pricing and real geospatial assignment throughout, and distributed tracing showing every hop as one connected trace. *(Order/Inventory/Payment/Delivery/Notification saga — complete.)*
3. **Nearest-driver routing with live tracking** — the closest available driver to the shipping warehouse is selected using real Haversine distance calculation, claimed atomically to prevent double-booking under concurrent assignment, and their simulated movement is broadcast live to any client watching that order. Verified end-to-end with a continuous stream of position updates ending in a correct `DELIVERED` state. *(Delivery — complete.)*

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
- [x] Real Catalog-based pricing, verified end-to-end
- [x] Payment idempotency proven under Vitest (same key → same outcome; different key → independent charge)
- [x] Distributed tracing across the full saga, verified as one connected trace
- [x] [ADR-0004](docs/adr/0004-saga-choreography.md) accepted

### Phase 3 — Delivery & Routing
- [x] Warehouse/driver/delivery model
- [x] Nearest-available-driver assignment via Haversine, atomically claimed
- [x] Live delivery tracking over WebSocket, backed by a real simulation job
- [x] [ADR-0005](docs/adr/0005-geospatial-routing.md) accepted

### Phase 4 — Presentation
- [x] Notification Service — event-driven, idempotent, Twilio-ready (stubbed pending phone lookup)
- [ ] Minimal dashboard showing live order flow and delivery tracking
- [ ] Case study write-up

### Phase 5 — Deployment
- [ ] Expand automated coverage to Order, Delivery, and Notification (currently strongest on Inventory and Payment)
- [ ] Managed infra swap (Neon, Upstash, CloudAMQP)
- [ ] Production env vars, CI/CD per service
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

*A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose.*
