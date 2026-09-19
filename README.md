# Flux

> *One order. Six services. Zero excuses.*

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

🚧 **In active development.** Gateway, Catalog, Inventory, Order, and Payment are complete and proven end-to-end, including the full choreographed saga (success and compensation paths), real Catalog-based pricing, and distributed tracing across every hop.

**Delivery Service is now complete too.** Given a confirmed order, Delivery assigns the nearest available driver to the warehouse (real Haversine distance calculation, atomically claimed to prevent double-booking), simulates that driver's movement over time, and broadcasts live position updates over WebSocket to any client watching that order — verified with a real, continuous stream of location updates converging on the destination, ending in a clean `DELIVERED` state.

Distributed tracing (OpenTelemetry + Jaeger) now spans all five participating services in a single connected trace per order — verified live, showing "Services: 4" (Order, Inventory, Payment, Delivery) across a single request's full journey.

ADR-0001 through ADR-0005 are complete and accepted. **Phase 3 is fully closed.** Notification Service, a frontend dashboard, and deployment are the remaining work.

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
- **Failure is a first-class case.** If payment fails after inventory succeeds, the system compensates — it doesn't leave the order in a broken half-state. Proven under genuine random failures, not just simulated on demand.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-driver assignment by real distance calculation, and live delivery tracking over WebSocket.
- **Observable by design.** A single order's journey across five services is visible as one connected trace, not five separate log streams.

---

## Architecture

Each service owns its own PostgreSQL database. Synchronous calls are used only for two cases: Gateway's authenticated proxy, and Order's single price lookup from Catalog at placement time. Everything else — order state changes, payment confirmations, delivery assignment, live position updates — flows as events through RabbitMQ, or in Delivery's case, out to the browser over WebSocket.

**The full proven saga, five services deep:**

`POST /orders` → Order looks up real Catalog pricing, writes `PENDING`, publishes `OrderCreated` → Inventory atomically reserves stock, publishes `InventoryReserved` → Order updates to `STOCK_RESERVED`, publishes `ChargePayment` with the real amount → Payment simulates a charge, publishes `PaymentSucceeded`/`PaymentFailed` → on success, Order finalizes to `CONFIRMED` and publishes `AssignDelivery` (reusing the warehouse Inventory already reserved against — Delivery never re-derives that decision) → Delivery atomically claims the nearest available driver by real Haversine distance, publishes `DeliveryAssigned` → a background simulation moves that driver toward the warehouse every 5 seconds, broadcasting live position updates over WebSocket to any subscribed client, until the delivery reaches `DELIVERED`.

On payment failure: Order publishes `ReleaseReservation` instead, and Inventory releases the held stock — confirmed via direct database query, independently, more than once.

See [ADR-0004](docs/adr/0004-saga-choreography.md) for the choreography-vs-orchestration reasoning, and [ADR-0005](docs/adr/0005-geospatial-routing-approach.md) for the geospatial routing decision.

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
│   ├── gateway/        auth (3 methods), routing              complete
│   ├── catalog/        products, search                       complete
│   ├── inventory/      stock, reservations, expiry job         complete
│   ├── order/          saga participant, order lifecycle        complete
│   ├── payment/        simulated charges, idempotency           complete
│   ├── delivery/       nearest-driver assignment, live tracking complete
│   └── notification/   event-driven alerts                     not started
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
        ├── <feature>.routes.ts       (HTTP-facing services only)
        ├── <feature>.controller.ts   (HTTP-facing services only)
        ├── <feature>.service.ts
        ├── <feature>.gateway.ts      (saga event subscribers/publishers)
        └── dto/
```

`common/events/` (`connection.ts`, `publisher.ts`, `subscriber.ts`) wraps RabbitMQ behind a small generic API, with manual OpenTelemetry trace-context propagation built in — the publisher injects the active trace into message headers, the subscriber extracts it and wraps the handler so spans created downstream attach to the same trace, not a new disconnected one. `common/tracing.ts` is identical across all five services and must load its own `dotenv/config` independently, since it runs before `server.ts` via Node's `--import` flag.

Delivery additionally has `common/websocket/websocket.ts` (a thin Socket.IO wrapper with per-order rooms) and `modules/deliveries/deliveries.tracking.ts` (the periodic simulation that moves an assigned driver toward the destination and broadcasts progress).

---

## Services & Build Status

| Service | Status | Responsibility |
| --- | --- | --- |
| Gateway | Complete | Auth (email/password, OTP, Google), request routing, token validation |
| Catalog | Complete | Products: create, get, list (filtered/paginated), update |
| Inventory | Complete | Per-location stock, concurrency-safe reservations with timeout, background expiry job |
| Order | Complete | Order lifecycle, real Catalog pricing, drives the saga through Inventory, Payment, and Delivery |
| Payment | Complete | Simulated charge outcome, idempotent via unique constraint on orderId |
| Delivery | Complete | Nearest-driver assignment (Haversine, atomically claimed), live position simulation, WebSocket broadcast per order |
| Notification | Not started | Order-status updates via SMS/push, driven entirely by events |

---

## Authentication

Gateway does not use full OpenID Connect — that's the right tool for an external identity provider serving multiple third-party clients, not a single product's internal services. Instead, Gateway supports three login methods, all converging on one shared token-issuing function:

- Email/password — bcrypt-hashed, standard signup/login
- OTP (phone) — Twilio-backed, rate-limited (3/hour), row-locked verification to prevent replay
- Google OAuth — implemented via direct HTTPS calls to Google's endpoints, no SDK

All three produce the same JWT (RS256, 15-minute expiry) plus an opaque refresh token pair. Refresh tokens are random values, hashed and stored server-side in a sessions table, and rotate on every use, so they can be revoked instantly, unlike a signed refresh JWT. The Gateway validates every incoming request's token before proxying it to a downstream service, and forwards the verified user's ID via an x-user-id header — services trust this header rather than re-authenticating every call. See ADR-0002 for the full reasoning.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Language | TypeScript (strict, ESM/nodenext) | Type-safe code across all services |
| Runtime | Node.js 20, Express 5 | Per-service HTTP APIs |
| Database | PostgreSQL (one per service), Drizzle ORM | Durable, service-owned data |
| Cache / Locking | Valkey (Redis-compatible) | Stock reservation TTLs, distributed locks |
| Event Broker | RabbitMQ (topic exchange, flux.events) | Async communication between services |
| Real-time | Socket.IO | Live delivery position updates per order (room-scoped) |
| Tracing | OpenTelemetry + Jaeger | End-to-end request tracing, manually propagated across RabbitMQ |
| Auth | JWT (RS256), bcrypt, Twilio, Google OAuth2 (raw HTTPS) | Multi-method authentication |
| Validation | Zod + BaseDto pattern | Schema-based DTO validation |
| Dev Tooling | Docker Compose, tsc-watch | Local multi-service infrastructure |

---

## Quick Start

### 1. Start everything

```bash
docker compose up -d --build
docker compose ps
```

Confirm all containers (Postgres, Valkey, RabbitMQ, Jaeger, and the services) show Up.

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

Watch `docker compose logs -f order inventory payment delivery` to see the event chain fire in real time. Payment simulates a charge with a ~90% success rate; on success, the saga continues all the way to a driver assignment and live tracking.

### 4. Watch live delivery tracking

Connect a Socket.IO client to `http://localhost:4005`, emit `subscribe` with the order's ID, and listen for `delivery:update` events — a new one arrives roughly every 5 seconds until the delivery reaches DELIVERED.

### 5. Inspect a trace

Open `http://localhost:16686`, search under the order service, and open the most recent trace — it should span every service that order touched.

Each service has two env files: `.env` (uses localhost, for local tooling) and `.env.docker` (uses the Docker service name as the hostname, for containers) — docker compose reads the latter automatically.

---

## Core Hard Problems

1. **Zero overselling under concurrency** — proven under a real load test: 100 concurrent requests against 1 unit of stock, exactly 1 success. A background job auto-releases abandoned reservations, also proven live. (Inventory — complete.)
2. **The order saga** — order placed, inventory reserved, payment charged, delivery assigned. Both the success and compensation paths are proven live in Docker, with real pricing and real geospatial assignment throughout, and distributed tracing showing every hop as one connected trace. (Order/Inventory/Payment/Delivery saga — complete.)
3. **Nearest-driver routing with live tracking** — the closest available driver to the shipping warehouse is selected using real Haversine distance calculation, claimed atomically to prevent double-booking under concurrent assignment, and their simulated movement is broadcast live to any client watching that order. Verified end-to-end with a continuous stream of position updates ending in a correct DELIVERED state. (Delivery — complete.)

---

## Roadmap

### Phase 0 — Foundation
- Repo structure, Docker Compose infra
- Gateway with full 3-method authentication
- Catalog service, tested through Gateway's proxy

### Phase 1 — Inventory & Concurrency
- Atomic reservation with timeout, proven zero-oversell under 100 concurrent requests
- Background expiry job, verified live
- ADR-0003 accepted

### Phase 2 — Order Saga
- Order and Payment services built
- Success and compensation paths proven live, multiple times
- Real Catalog-based pricing, verified end-to-end
- Distributed tracing across the full saga, verified as one connected trace
- ADR-0004 accepted

### Phase 3 — Delivery & Routing
- Warehouse/driver/delivery model
- Nearest-available-driver assignment via Haversine, atomically claimed
- Live delivery tracking over WebSocket, backed by a real simulation job
- ADR-0005 accepted

### Phase 4 — Presentation (not started)
- Notification Service
- Minimal dashboard showing live order flow and delivery tracking
- Case study write-up

### Phase 5 — Deployment (not started)
- Managed infra swap
- Production env vars, CI/CD per service
- Post-deploy verification

---

## Non-Goals (for v1)

- Seller/marketplace onboarding
- Full admin back-office and analytics dashboards
- Recommendation engine / personalization
- Native mobile apps
- Internationalization / multi-currency

---

## Architecture Decisions

- ADR-0001: Database-per-service vs shared database
- ADR-0002: Authentication strategy
- ADR-0003: Concurrency strategy for inventory reservation
- ADR-0004: Saga pattern — choreography vs orchestration
- ADR-0005: Geospatial routing approach

---

*A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose.*
