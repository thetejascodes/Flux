# Flux

> *One order. Six services. Zero excuses.*

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

🚧 **In active development.** Gateway (full authentication), Catalog (product CRUD), and Inventory (stock reservations, background expiry job, fully dockerized) are complete and tested end-to-end, including the full Gateway → service authenticated proxy path in Docker. Inventory's concurrency test — 100 concurrent requests against 1 unit of stock — correctly yields exactly 1 success and zero overselling. ADR-0001 through ADR-0003 are complete and accepted.

Order Service now exists and is dockerized. The first half of the order saga — Order publishes `OrderCreated`, Inventory reacts, reserves stock, and publishes back — has been proven working end-to-end across both services and both databases, verified live in Docker. Payment Service, the compensation path, and distributed tracing are not yet built.

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
- **Failure is a first-class case.** If payment succeeds and inventory fails, the system compensates — it doesn't leave the order in a broken half-state.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-stock assignment, and live delivery tracking.
- **Observable by design.** Every request can be traced end-to-end across every service it touched.

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
   └─────────┘  └────┬─────┘ └───┬────┘ └─────────┘ └──────────────┘
                      │           │
                      └─────┬─────┘
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

Each service owns its own PostgreSQL database. Synchronous calls (via the Gateway) are used only where an immediate response is required (e.g. "is this in stock right now?"); everything else — order state changes, payment confirmations, delivery assignment — flows as events through the broker. This is what lets services fail independently without taking each other down, and what makes the order saga possible.

**Proven today:** `POST /orders` → Gateway authenticates and forwards `x-user-id` → Order writes a `PENDING` row and publishes `OrderCreated` → Inventory consumes it, atomically reserves stock, and publishes `InventoryReserved` → Order consumes that and updates its own row to `STOCK_RESERVED` with a real `reservationId`. Verified live across containers, not just in theory.

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
│   ├── order/          # saga orchestrator                 🚧 in progress
│   ├── payment/        # charges, webhooks                 ⬜ not started
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
        ├── <feature>.routes.ts
        ├── <feature>.controller.ts
        ├── <feature>.service.ts
        ├── <feature>.gateway.ts   # saga event subscribers, where applicable
        └── dto/
```

`common/events/` (`connection.ts`, `publisher.ts`, `subscriber.ts`) wraps RabbitMQ behind a small generic API — `publish(routingKey, payload)` and `subscribe(queue, routingKey, handler)` — shared across every service that participates in the saga.

---

## Services & Build Status

| Service | Status | Responsibility |
| --- | --- | --- |
| **Gateway** | ✅ Complete | Auth (email/password, OTP, Google), request routing, token validation |
| **Catalog** | ✅ Complete | Products: create, get, list (filtered/paginated), update |
| **Inventory** | ✅ Complete | Per-location stock, concurrency-safe reservations with timeout, background expiry job, dockerized and proxy-verified |
| **Order** | 🚧 In progress | Order creation, publishes `OrderCreated`, reacts to `InventoryReserved` / `InventoryReservationFailed`. Saga orchestration toward Payment not yet wired. |
| **Payment** | ⬜ Not started | Payment processing, idempotency keys, webhook reconciliation |
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
| **Tracing** | OpenTelemetry + Jaeger | End-to-end request tracing (planned) |
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

Each service has two env files: `.env` (uses `localhost`, for local tooling) and `.env.docker` (uses the Docker service name as the hostname, for containers) — `docker compose` reads the latter automatically. `.env.example` / `.env.docker.example` templates are committed for each service; the real files are gitignored.

---

## Core Hard Problems

The three problems Flux is actually built to solve well — everything else exists to support them.

1. **Zero overselling under concurrency** — two buyers hitting "buy" on the last unit at the same instant must never both succeed. Solved with an atomic conditional `UPDATE` (no explicit row lock needed — Postgres's own statement-level atomicity does the work), reservation-with-timeout, and a background job that auto-releases abandoned reservations. Proven under a real load test: 100 concurrent requests against 1 unit of stock, exactly 1 success — and proven live for the expiry path: an unconfirmed reservation was left to time out and was correctly auto-released, restoring stock without manual intervention. *(Inventory — complete.)*
2. **The order saga** — order placed → inventory reserved → payment charged → delivery assigned. If any step fails, prior steps are compensated instead of leaving a broken order behind. The first leg (Order ↔ Inventory) is built and verified live in Docker: a real `POST /orders` request correctly results in a reserved stock unit and an updated order status via async events, with no synchronous call between the two services. *(Order/Inventory leg — proven. Payment leg and compensation path — not yet built.)*
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
- [x] Order Service scaffolded (schema, DTOs, RabbitMQ event plumbing shared across services)
- [x] Order publishes `OrderCreated`; Inventory reacts via its own event subscribers instead of a direct API call
- [x] Order ↔ Inventory leg proven end-to-end in Docker: reservation succeeds, order status updates to `STOCK_RESERVED` with a real `reservationId`
- [ ] Payment Service with idempotency + webhooks
- [ ] Order → Payment leg, and compensating transaction on payment failure (release reservation)
- [ ] Distributed tracing (OpenTelemetry + Jaeger) across the full saga
- [ ] ADR-0004: saga pattern — choreography vs orchestration

### Phase 3 — Delivery & Routing
- [ ] Multi-warehouse/dark-store model, nearest-stock + nearest-driver assignment
- [ ] Live delivery tracking over WebSocket

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
- ADR-0004: Saga pattern — choreography vs orchestration *(pending — Order ↔ Inventory leg is already choreographed via RabbitMQ; ADR to be written once the Payment leg closes the loop)*
- ADR-0005: Geospatial routing approach *(pending)*

---

*A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose.*