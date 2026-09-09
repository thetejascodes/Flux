# Flux

> *One order. Six services. Zero excuses.*

Flux is a quick-commerce platform built as true microservices — not a CRUD storefront. Saga orchestration, zero-overselling concurrency, geospatial routing.

**Flux** is built the way the real thing is built — as a distributed system of independent services (Catalog, Inventory, Order, Payment, Delivery) that reserve stock, move money, route deliveries, and recover cleanly when any single piece fails. Not a CRUD storefront with a cart bolted on. A system designed to survive the moment two people try to buy the last item at the same second, or a payment succeeds while the warehouse goes dark. Built with TypeScript, Node.js, PostgreSQL, Redis, and RabbitMQ/Kafka.

**Status:** 🚧 In Planning — architecture defined, build not yet started.

---

## 📋 Table of Contents

- [Vision](#-vision)
- [What Makes This Different](#-what-makes-this-different)
- [Architecture](#-architecture)
- [Repository Structure](#-repository-structure)
- [Services](#-services)
- [Authentication & Service Trust](#-authentication--service-trust)
- [Tech Stack](#-tech-stack)
- [Core Hard Problems](#-core-hard-problems)
- [Feature Roadmap](#-feature-roadmap)
- [Non-Goals (for v1)](#-non-goals-for-v1)
- [Architecture Decisions](#-architecture-decisions)

---

## 🎯 Vision

Most portfolio e-commerce projects are a product table, a cart, and a checkout form — the same tutorial rebuilt a thousand times. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale — inventory consistency under concurrency, transactional integrity across independent services, and real-time delivery routing — without needing a team of thousands to prove it.

The goal isn't feature count. It's depth: a small number of services, each doing one thing correctly, wired together in a way that survives failure instead of pretending failure doesn't happen.

---

## ✨ What Makes This Different

- **No shared database.** Every service owns its data. No service reaches into another's tables.
- **Event-driven, not request-chained.** Services communicate through a message broker, not a waterfall of synchronous HTTP calls that collapse the moment one link is slow.
- **Failure is a first-class case.** If payment succeeds and inventory fails, the system compensates — it doesn't leave the order in a broken half-state.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-stock assignment, and live delivery tracking — not just "add to cart, ship in 5 days."
- **Observable by design.** Every request can be traced end-to-end across every service it touched.

---

## 🏗️ Architecture

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
                          │ (Kafka/RabbitMQ)│
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │  Notification   │
                          │  Service        │
                          └────────────────┘
```

Each service owns its own PostgreSQL database. Synchronous calls (via the gateway) are used only where an immediate response is required (e.g. "is this in stock right now?"); everything else — order state changes, payment confirmations, delivery assignment — flows as **events** through the broker instead of direct service-to-service calls. This is what lets services fail independently without taking each other down, and what makes the order saga (below) possible.

---

## 📁 Repository Structure

A single monorepo, not six separate repos — each service is still fully independent (own dependencies, own database, own Dockerfile), just co-located for easier solo development:

```
flux/
├── services/
│   ├── gateway/        # auth validation, routing
│   ├── catalog/        # products, search
│   ├── inventory/      # stock, reservations
│   ├── order/           # saga orchestrator
│   ├── payment/        # charges, webhooks
│   ├── delivery/       # routing, ETA, tracking
│   └── notification/   # event-driven alerts
├── docker-compose.yml   # spins up every service + Postgres + Redis + broker together
├── docs/
│   └── adr/
└── README.md
```

Each folder under `services/` is a self-contained Express/TypeScript app — the same code shape as any monolith, just running as its own process and talking to the others only over the network (HTTP through the gateway, or events through the broker).

---

## 🧩 Services

| Service | Responsibility |
| --- | --- |
| **API Gateway** | Single entry point, request routing, auth token validation |
| **Catalog Service** | Products, categories, pricing, search index |
| **Inventory Service** | Per-location stock, reservations with timeout, concurrency-safe decrements |
| **Order Service** | Order lifecycle, the saga orchestrator that coordinates the other services |
| **Payment Service** | Payment processing, idempotency keys, webhook handling and reconciliation |
| **Delivery Service** | Nearest dark-store assignment, delivery partner assignment, ETA, live tracking |
| **Notification Service** | Order-status updates via SMS/push, driven entirely by events |

---

## 🔐 Authentication & Service Trust

Flux does **not** use full OpenID Connect — that's the right tool for an external identity provider serving multiple third-party clients (which is what a separate project, Grantly, is for), not for a single product's internal services.

Instead:
- **User login** issues a plain JWT (access + refresh token pair), signed with a service-owned secret.
- **The Gateway validates every incoming request's token** before it reaches any service — downstream services trust the gateway rather than re-authenticating every call.
- **Signing keys are versioned (`kid`)** so the secret can be rotated later without invalidating active sessions — not built in v1, but the token structure is designed to support it without a rewrite.

This is the standard, correct approach for a system of this shape — OIDC would be over-engineering here, not a stronger choice.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Language** | TypeScript (strict mode) | Type-safe code across all services |
| **Runtime** | Node.js 20+, Express | Per-service HTTP APIs |
| **Database** | PostgreSQL (one instance per service) | Durable, service-owned data |
| **Cache / Locking** | Redis | Stock reservation TTLs, distributed locks |
| **Event Broker** | Kafka or RabbitMQ | Async communication between services |
| **Search** | Meilisearch | Product catalog search |
| **Geospatial** | PostGIS or haversine queries | Nearest-warehouse and nearest-driver assignment |
| **Real-time** | WebSocket | Live order and delivery tracking |
| **Tracing** | OpenTelemetry + Jaeger | End-to-end request tracing across services |
| **Dev Tooling** | Docker Compose | Local multi-service infrastructure |

---

## 🔥 Core Hard Problems

These are the three problems Flux is actually built to solve well — everything else in the system exists to support them.

1. **Zero overselling under concurrency** — Two buyers hitting "buy" on the last unit at the same instant must never both succeed. Solved with reservation-with-timeout plus concurrency-safe stock decrements, proven under load test.
2. **The order saga** — Order placed → inventory reserved → payment charged → delivery assigned. If any step fails, prior steps are compensated (stock released, payment refunded) instead of leaving a broken order behind.
3. **Nearest-stock, nearest-driver routing** — Orders are assigned to the closest dark store with available stock and the closest available delivery partner, with a real ETA calculation — the piece that makes this quick-commerce rather than generic e-commerce.

---

## 🗺️ Feature Roadmap

### Phase 0 — Foundation
- [ ] Repo structure, Docker Compose infra (Postgres, Redis, broker)
- [ ] API Gateway with auth
- [ ] Catalog Service with search

### Phase 1 — Inventory & Concurrency
- [ ] Per-location stock model
- [ ] Reservation with timeout (Redis TTL)
- [ ] Load test proving zero overselling
- [ ] ADR: concurrency approach and trade-offs

### Phase 2 — Order Saga
- [ ] Order Service as saga orchestrator
- [ ] Payment Service with idempotency + webhooks
- [ ] Compensating transactions on failure
- [ ] Event-driven communication via broker
- [ ] Distributed tracing across services

### Phase 3 — Delivery & Routing
- [ ] Multi-warehouse/dark-store model
- [ ] Nearest-stock + nearest-driver assignment
- [ ] ETA calculation
- [ ] Live delivery tracking over WebSocket

### Phase 4 — Presentation
- [ ] Notification Service
- [ ] Minimal dashboard showing live order flow
- [ ] Case study write-up: architecture, hard problems solved, trade-offs

---

## 🚫 Non-Goals (for v1)

Deliberately out of scope, so the project ships instead of sprawling:

- Seller/marketplace onboarding (multi-vendor support)
- Full admin back-office and analytics dashboards
- Recommendation engine / personalization
- Native mobile apps (web + WebSocket tracking is enough to prove the backend)
- Internationalization / multi-currency

---

## 📐 Architecture Decisions

*(To be written as the project progresses, following the same ADR format used in [Unsaid](../unsaid) and [Grantly](../grantly).)*

- ADR-0001: Database-per-service vs shared database
- ADR-0002: Concurrency strategy for inventory reservation
- ADR-0003: Saga pattern — choreography vs orchestration
- ADR-0004: Message broker choice (Kafka vs RabbitMQ)
- ADR-0005: Geospatial routing approach

---

*A masterpiece isn't the one with the most features. It's the one where every piece exists on purpose.*