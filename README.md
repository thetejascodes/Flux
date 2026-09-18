# Flux

> *One order. Six services. Zero excuses.*

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

🚧 **In active development.** Gateway (full authentication), Catalog (product CRUD), and Inventory (stock reservations, background expiry job, fully dockerized) are complete and tested end-to-end, including the full Gateway → service authenticated proxy path in Docker. Inventory's concurrency test — 100 concurrent requests against 1 unit of stock — correctly yields exactly 1 success and zero overselling.

**The full order saga is now built and proven, both branches, with real pricing.** Order and Payment services exist, are dockerized, and communicate with Inventory purely through RabbitMQ events — no synchronous service-to-service calls anywhere in that flow. A real `POST /orders` request looks up the live price from Catalog, cascades through Order → Inventory → Payment and back, and ends in a `CONFIRMED` order carrying a real `reservationId`, `paymentId`, and computed `totalAmount` — verified to match, to the cent, the amount independently recorded in Payment's own database. The compensation path has also been proven under a genuine random payment failure: the order correctly reached `PAYMENT_FAILED`, and the corresponding reservation in Inventory's independent database was confirmed `RELEASED` — verified by direct database query, not just application logs.

ADR-0001 through ADR-0005 are complete and accepted. Phase 2 is formally closed, with distributed tracing (OpenTelemetry + Jaeger) proven across the full saga.

---

## Table of Contents

- [What Makes This Different](#what-makes-this-different)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Services & Build Status](#services--build-status)
- [Authentication](#authentication)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Core Hard Problems](#core-hard-problems)
- [Roadmap](#roadmap)
- [Non-Goals (for v1)](#non-goals-for-v1)
- [Architecture Decisions](#architecture-decisions)

---

## What Makes This Different

- **No shared database.** Every service owns its data. No service reaches into another's tables.
- **Event-driven, not request-chained.** Services communicate through a message broker where consistency doesn't need to be immediate, not a chain of synchronous calls that collapses the moment one link is slow.
- **Failure is a first-class case.** If payment fails after inventory succeeds, the system compensates — it doesn't leave the order in a broken half-state. This isn't theoretical: it's been triggered under a genuine random failure and verified against the database.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-stock assignment, and live delivery tracking.
- **Observable by design.** Every request can be traced end-to-end across every service it touched. *(Tracing infrastructure — planned next.)*

---

## Architecture

```
                        ┌─────────────────┐
                        │   API Gateway     │
                        │  (auth, routing)  │
                        └────────┬──────────┘
                                 │
        ┌────────────┬──────────┼──────────┬────────────┐
        ▼            ▼          ▼          ▼            ▼
   ┌─────────┐  ┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────────┐
   │ Catalog │  │Inventory │ │ Order  │ │Payment  │ │  Delivery    │
   │ Service │  │ Service  │ │Service │ │Service  │ │  Service     │
   └────▲────┘  └────┬─────┘ └───┬────┘ └────┬────┘ └──────────────┘
        │             │           │           │
        └─────────────┼───────────┘           │
                  (sync, price lookup)         │
                      └─────┬─────┴─────┬──────┘
                          ┌───────▼────────┐
                          │  Event Broker   │
                          │   (RabbitMQ)    │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │  Notification   │
                          │  Service        │
                          └────────────────┘
```

Each service owns its own PostgreSQL database. Synchronous calls (via the Gateway, or a single direct service-to-service HTTP call like Order's pricing lookup) are used only where an immediate response is required; everything else — order state changes, payment confirmations, delivery assignment — flows as events through the broker. This is what lets services fail independently without taking each other down, and what makes the order saga possible.

**Proven, both branches, with real pricing:**

- **Success:** `POST /orders` → Gateway authenticates and forwards `x-user-id` → Order looks up the live unit price from Catalog, computes `totalAmount`, writes a `PENDING` row, and publishes `OrderCreated` → Inventory atomically reserves stock and publishes `InventoryReserved` → Order updates to `STOCK_RESERVED` and publishes `ChargePayment` carrying the real `totalAmount` → Payment simulates a charge for that exact amount, records it, and publishes `PaymentSucceeded` → Order finalizes to `CONFIRMED`. Verified end-to-end: an order for 2 units of a $12.00 product produced `totalAmount: "24.00"` on the order and an identical `amount: 24.00` recorded independently in Payment's own database.
- **Failure / compensation:** the same flow, except Payment's simulated charge fails and publishes `PaymentFailed` → Order marks the order `PAYMENT_FAILED` and publishes `ReleaseReservation` → Inventory releases the held stock. Confirmed directly against Inventory's database: the reservation's status transitioned to `RELEASED`.

See [ADR-0004](docs/adr/0004-saga-choreography.md) for the full reasoning behind choosing choreography over a central orchestrator.

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
│   ├── gateway/        # auth (3 methods), routing        ✅ complete
│   ├── catalog/        # products, search                 ✅ complete
│   ├── inventory/      # stock, reservations, expiry job   ✅ complete
│   ├── order/          # saga participant, order lifecycle  ✅ complete
│   ├── payment/        # simulated charges, idempotency     ✅ complete (real provider — future work)
│   ├── delivery/       # routing, ETA, tracking             ⬜ not started
│   └── notification/   # event-driven alerts               ⬜ not started
└── README.md
```

Each service follows the same shape:

```
services/<name>/
├── package.json, tsconfig.json, Dockerfile, .env, .env.docker
└── src/
    ├── app.ts, server.ts
    ├── common/{config, db, dto, middlewares, utils, events}/
    └── modules/<feature>/
        ├── <feature>.routes.ts       # HTTP-facing services only
        ├── <feature>.controller.ts   # HTTP-facing services only
        ├── <feature>.service.ts
        ├── <feature>.gateway.ts      # saga event subscribers/publishers
        └── dto/
```

`common/events/` (`connection.ts`, `publisher.ts`, `subscriber.ts`) wraps RabbitMQ behind a small generic API — `publish(routingKey, payload)` and `subscribe(queue, routingKey, handler)` — byte-for-byte identical across every service that participates in the saga. Payment has no HTTP routes at all; it is purely event-driven, reacting only to `ChargePayment`. Order is the one exception to "no synchronous calls": it makes a single direct HTTP call to Catalog at order-placement time to fetch the current price, since that value must be known before an order can even be created — everything after that point is pure events.

---

## Services & Build Status

| Service | Status | Responsibility |
| --- | --- | --- |
| **Gateway** | ✅ Complete | Auth (email/password, OTP, Google), request routing, token validation |
| **Catalog** | ✅ Complete | Products: create, get, list (filtered/paginated), update |
| **Inventory** | ✅ Complete | Per-location stock, concurrency-safe reservations with timeout, background expiry job, dockerized and proxy-verified |
| **Order** | ✅ Complete | Order lifecycle, looks up real pricing from Catalog at placement time, publishes `OrderCreated`, reacts to Inventory's and Payment's events, drives the saga to `CONFIRMED` or `PAYMENT_FAILED` |
| **Payment** | ✅ Complete | Reacts to `ChargePayment`, simulates a charge outcome, idempotent on redelivery via a unique constraint on `orderId`, publishes `PaymentSucceeded` / `PaymentFailed`. Real payment provider integration is future work. |
| **Delivery** | ⬜ Not started | Nearest dark-store/driver assignment, ETA, live tracking |
| **Notification** | ⬜ Not started | Order-status updates via SMS/push, driven entirely by events |

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
| **Auth** | JWT (RS256), bcrypt, Twilio, Google OAuth2 (raw HTTPS) | Multi-method authentication |
| **Validation** | Zod + BaseDto pattern | Schema-based DTO validation |
| **Real-time** | WebSocket | Live order and delivery tracking (planned) |
| **Tracing** | OpenTelemetry + Jaeger | End-to-end request tracing (planned — next up) |
| **Dev Tooling** | Docker Compose, tsc-watch | Local multi-service infrastructure |

---

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d postgres valkey rabbitmq
```

This starts PostgreSQL (`localhost:5432`), Valkey (`localhost:6379`), and RabbitMQ (`localhost:5672`, management UI at `localhost:15672`).

### 2. Run a service locally (e.g. Gateway)

```bash
cd services/gateway
npm install
npx drizzle-kit generate
npx drizzle-kit migrate
npm run dev
```

### 3. Or run everything through Docker

```bash
docker compose up -d --build
```

### 4. Verify

```bash
curl http://localhost:4000/health
# { "status": "ok" }
```

### 5. Exercise the full saga

```bash
curl -X POST http://localhost:4000/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"productId": "...", "warehouseId": "...", "quantity": 1}'
```

The response includes a real `totalAmount`, computed from Catalog's current price for that product. Watch `docker compose logs -f order inventory payment` to see the event chain fire in real time. Payment simulates a charge with a ~90% success rate, so repeated requests will eventually surface both the success path (`CONFIRMED`) and the compensation path (`PAYMENT_FAILED` with the reservation released).

Each service has two env files: `.env` (uses `localhost`, for local tooling) and `.env.docker` (uses the Docker service name as the hostname, for containers) — `docker compose` reads the latter automatically. `.env.example` / `.env.docker.example` templates are committed for each service; the real files are gitignored.

---

## Core Hard Problems

The three problems Flux is actually built to solve well — everything else exists to support them.

1. **Zero overselling under concurrency** — two buyers hitting "buy" on the last unit at the same instant must never both succeed. Solved with an atomic conditional `UPDATE` (no explicit row lock needed — Postgres's own statement-level atomicity does the work), reservation-with-timeout, and a background job that auto-releases abandoned reservations. Proven under a real load test: 100 concurrent requests against 1 unit of stock, exactly 1 success — and proven live for the expiry path: an unconfirmed reservation was left to time out and was correctly auto-released, restoring stock without manual intervention. *(Inventory — complete.)*
2. **The order saga** — order placed → inventory reserved → payment charged. If any step fails, prior steps are compensated instead of leaving a broken order behind. Both branches are built and proven live in Docker, with real pricing throughout: the success path ends in a `CONFIRMED` order with a real `reservationId`, `paymentId`, and computed `totalAmount` that matches Payment's independently recorded amount to the cent; the failure path, triggered by a genuine random payment decline, ends in `PAYMENT_FAILED` with the Inventory reservation independently confirmed `RELEASED` via direct database query. *(Order/Inventory/Payment saga — complete. Delivery step — not yet built.)*
3. **Nearest-stock, nearest-driver routing** — orders assigned to the closest dark store with available stock and the closest available delivery partner, with a real ETA calculation. *(Delivery — not yet built.)*

---

## Roadmap

### Phase 0 — Foundation
- [x] Repo structure, Docker Compose infra (Postgres, Valkey, RabbitMQ)
- [x] Gateway with full 3-method authentication
- [x] Catalog service — CRUD complete, tested end-to-end through Gateway's authenticated proxy

### Phase 1 — Inventory & Concurrency
- [x] Per-location stock model, atomic reservation with timeout
- [x] Load test proving zero overselling — 100 concurrent requests, 1 unit of stock, exactly 1 success
- [x] Background job to auto-release expired reservations — built and verified live (reservation expired, stock correctly restored)
- [x] Dockerized and verified through Gateway's proxy in Docker
- [x] ADR-0003: concurrency approach and trade-offs (completed and accepted)

### Phase 2 — Order Saga
- [x] Order Service built (schema, DTOs, RabbitMQ event plumbing shared across services)
- [x] Payment Service built (simulated charge, idempotency via unique `orderId` constraint)
- [x] Order publishes `OrderCreated`; Inventory reacts via its own event subscribers instead of a direct API call
- [x] Order ↔ Inventory leg proven: reservation succeeds, order status updates to `STOCK_RESERVED` with a real `reservationId`
- [x] Order → Payment leg proven: `ChargePayment` → `PaymentSucceeded` → order `CONFIRMED`, with real `paymentId`
- [x] Compensating transaction proven under a genuine random payment failure: `PaymentFailed` → order `PAYMENT_FAILED` → `ReleaseReservation` → reservation confirmed `RELEASED` in Inventory's database
- [x] ADR-0004: saga pattern — choreography vs orchestration (completed and accepted)
- [x] Real Catalog-based pricing: Order looks up the live price at placement time; verified end-to-end against Payment's independently recorded amount
- [x] Distributed tracing (OpenTelemetry + Jaeger) across the full saga

**Phase 2 completion record:** OpenTelemetry is enabled in Order, Inventory, and Payment with Node auto-instrumentation and OTLP HTTP export to Jaeger. RabbitMQ event subscribers extract and restore trace context, so the asynchronous `OrderCreated` → `InventoryReserved` → `ChargePayment` → `PaymentSucceeded` / `PaymentFailed` → `ReleaseReservation` flow can be followed as one distributed trace across the saga services. Phase 2 is now complete.

### Phase 3 — Delivery & Routing
- [ ] Multi-warehouse/dark-store model, nearest-stock + nearest-driver assignment
- [ ] Live delivery tracking over WebSocket
- [x] ADR-0005: geospatial routing approach (completed and accepted)

### Phase 4 — Presentation
- [ ] Notification Service
- [ ] Minimal dashboard showing live order flow
- [ ] Case study write-up

---

## Non-Goals (for v1)

Deliberately out of scope, so the project ships instead of sprawling:

- Seller/marketplace onboarding (multi-vendor support)
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
