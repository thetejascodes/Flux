# Flux

> *One order. Six services. Zero excuses.*

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

🚧 **In active development.** Gateway (full authentication) is complete and tested end-to-end. Catalog (product CRUD) is nearing completion. Inventory, Order, Payment, Delivery, and Notification are not yet started.

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
   └─────────┘  └──────────┘ └───┬────┘ └─────────┘ └──────────────┘
                                  │
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
│   ├── catalog/        # products, search                 🚧 nearly complete
│   ├── inventory/      # stock, reservations               ⬜ not started
│   ├── order/          # saga orchestrator                 ⬜ not started
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
    ├── common/{config, db, dto, middlewares, utils}/
    └── modules/<feature>/
        ├── <feature>.routes.ts
        ├── <feature>.controllers.ts
        ├── <feature>.service.ts
        └── dto/
```

---

## Services & Build Status

| Service | Status | Responsibility |
| --- | --- | --- |
| **Gateway** | ✅ Complete | Auth (email/password, OTP, Google), request routing, token validation |
| **Catalog** | 🚧 Nearly complete | Products: create, get, list (filtered/paginated), update |
| **Inventory** | ⬜ Not started | Per-location stock, concurrency-safe reservations with timeout |
| **Order** | ⬜ Not started | Order lifecycle, saga orchestration across services |
| **Payment** | ⬜ Not started | Payment processing, idempotency keys, webhook reconciliation |
| **Delivery** | ⬜ Not started | Nearest dark-store/driver assignment, ETA, live tracking |
| **Notification** | ⬜ Not started | Order-status updates via SMS/push, driven entirely by events |

---

## Authentication

Gateway does **not** use full OpenID Connect — that's the right tool for an external identity provider serving multiple third-party clients, not a single product's internal services. Instead, Gateway supports three login methods, all converging on one shared token-issuing function:

- **Email/password** — bcrypt-hashed, standard signup/login
- **OTP (phone)** — Twilio-backed, rate-limited (3/hour), row-locked verification to prevent replay
- **Google OAuth** — implemented via direct HTTPS calls to Google's endpoints, no SDK

All three produce the same JWT (RS256, 15-minute expiry) + opaque refresh token pair. Refresh tokens are random values, hashed and stored server-side in a `sessions` table, and rotate on every use — so they can be revoked instantly, unlike a signed refresh JWT. The Gateway validates every incoming request's token before proxying it to a downstream service; services trust the Gateway's `x-user-id` header rather than re-authenticating every call. See [ADR-0002](docs/adr/0002-authentication-strategy.md) for the full reasoning.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Language** | TypeScript (strict, ESM/nodenext) | Type-safe code across all services |
| **Runtime** | Node.js 20, Express 5 | Per-service HTTP APIs |
| **Database** | PostgreSQL (one per service), Drizzle ORM | Durable, service-owned data |
| **Cache / Locking** | Valkey (Redis-compatible) | Stock reservation TTLs, distributed locks |
| **Event Broker** | RabbitMQ | Async communication between services |
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

### 3. Verify

```bash
curl http://localhost:4000/health
# { "status": "ok" }
```

Each service has two env files: `.env` (uses `localhost`, for local tooling) and `.env.docker` (uses `postgres` as the hostname, for containers) — `docker compose` reads the latter automatically.

---

## Core Hard Problems

The three problems Flux is actually built to solve well — everything else exists to support them.

1. **Zero overselling under concurrency** — two buyers hitting "buy" on the last unit at the same instant must never both succeed. Solved with reservation-with-timeout plus concurrency-safe stock decrements, proven under load test. *(Inventory — not yet built.)*
2. **The order saga** — order placed → inventory reserved → payment charged → delivery assigned. If any step fails, prior steps are compensated instead of leaving a broken order behind. *(Order/Payment — not yet built.)*
3. **Nearest-stock, nearest-driver routing** — orders assigned to the closest dark store with available stock and the closest available delivery partner, with a real ETA calculation. *(Delivery — not yet built.)*

---

## Roadmap

### Phase 0 — Foundation
- [x] Repo structure, Docker Compose infra (Postgres, Valkey, RabbitMQ)
- [x] Gateway with full 3-method authentication
- [ ] Catalog service (nearly complete)

### Phase 1 — Inventory & Concurrency
- [ ] Per-location stock model, reservation with timeout
- [ ] Load test proving zero overselling
- [ ] ADR-0003: concurrency approach and trade-offs

### Phase 2 — Order Saga
- [ ] Order Service as saga orchestrator
- [ ] Payment Service with idempotency + webhooks
- [ ] Compensating transactions on failure, distributed tracing

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
- ADR-0003: Concurrency strategy for inventory reservation *(pending)*
- ADR-0004: Saga pattern — choreography vs orchestration *(pending)*
- ADR-0005: Geospatial routing approach *(pending)*

---

*A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose.*