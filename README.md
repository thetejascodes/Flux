# Flux

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems: inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery without a single shared database.

## Status

This repository is now in a working foundational state:

- Docker infrastructure is configured and bootstraps the local platform environment.
- PostgreSQL, Valkey, and RabbitMQ are defined in Docker Compose.
- The gateway service is implemented and can start as a TypeScript Express app.
- Database initialization scripts create service-specific PostgreSQL databases.
- The project is organized as a multi-service architecture with clear separation of responsibilities.

The system is not yet feature-complete as a full commerce platform, but the base architecture and runtime scaffolding are now in place.

---

## What is complete

### Infrastructure
- Docker Compose stack for local development
- PostgreSQL instance with bootstrapped service databases
- Valkey instance for cache and future reservation/lock workflows
- RabbitMQ instance for event-driven service communication
- Health-checked container startup flow

### Gateway foundation
- Express app configured with JSON parsing
- Centralized config loading from environment variables
- Error middleware
- Health endpoint at `/health`
- Drizzle + PostgreSQL integration configured for future service data access
- Twilio-ready OTP configuration for authentication flows

### Monorepo structure
- `services/` organized by domain
- Each service has its own package and TypeScript setup
- Shared architecture supports future expansion without a single app monolith

### Project conventions
- TypeScript-first service architecture
- Environment-based config management
- Database-per-service design model
- Event-driven extension path for order and payment workflows

---

## Repository structure

```text
flux/
├── docker-compose.yml
├── README.md
├── docs/
│   └── adr/
├── scripts/
│   └── init-databases.sh
├── services/
│   ├── catalog/
│   ├── delivery/
│   ├── gateway/
│   ├── inventory/
│   ├── notification/
│   ├── order/
│   ├── payment/
│   └── ...
└──
```

---

## Active stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Runtime | Node.js + Express |
| Database | PostgreSQL |
| Cache | Valkey |
| Messaging | RabbitMQ |
| Containerization | Docker + Docker Compose |
| Schema tooling | Drizzle ORM |

---

## Current architecture

```text
Client
  |
  v
API Gateway
  |
  +--> Catalog
  +--> Inventory
  +--> Order
  +--> Payment
  +--> Delivery
  +--> Notification

Supporting infrastructure:
- PostgreSQL per service model
- Valkey for transient caching and lock semantics
- RabbitMQ for async communication
```

This architecture is designed so each service owns its own data and responsibilities, while still coordinating through the gateway and message bus.

---

## Quick start

### 1) Start the platform services

```bash
docker compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Valkey on `localhost:6379`
- RabbitMQ on `localhost:5672`
- RabbitMQ management UI on `http://localhost:15672`
- Gateway service on `http://localhost:4000`

### 2) Start the gateway locally

From the gateway folder:

```bash
cd services/gateway
npm install
npm run dev
```

### 3) Verify it is alive

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{ "status": "ok" }
```

---

## Service responsibilities

| Service | Status | Responsibility |
| --- | --- | --- |
| Gateway | Complete foundation | Entry point, config, request validation, health checks |
| Catalog | Planned | Product inventory and item metadata |
| Inventory | Planned | Stock, reservations, and quantity checks |
| Order | Planned | Order lifecycle and saga coordination |
| Payment | Planned | Payment processing and reconciliation |
| Delivery | Planned | Routing, dispatch, and ETA logic |
| Notification | Planned | Event-driven alerts and messaging |

---

## What is still pending

The following are intentionally not fully implemented yet:

- real product catalog APIs
- inventory reservation logic
- order orchestration workflow
- payment processing flow
- delivery assignment logic
- notification consumers
- end-to-end user checkout flows
- robust auth/session lifecycle beyond the infrastructure groundwork

This is a normal phase for a distributed system project: the base platform, runtime scaffolding, and service boundaries are established first, and the domain flows are added next.

---

## Design direction

Flux follows a service-owned, event-driven approach instead of a single shared-database app. The current repository structure is aligned with the following principles:

- no hidden cross-service database access
- clear ownership of domain state
- async communication where consistency is eventually coordinated
- readiness for saga-driven workflows and compensating actions
- infrastructure that can be run locally as a realistic development environment

---

## Roadmap

### Phase 1: API and service layering
- complete gateway auth and routing structure
- build catalog service endpoints
- structure inventory and order domains

### Phase 2: transactional workflows
- reserve inventory with timeout semantics
- robust order lifecycle management
- payment integration and compensation handling

### Phase 3: delivery and distribution
- assign nearest available stock and couriers
- ETA and tracking workflows
- notification events for live updates

### Phase 4: polish and validation
- end-to-end tests
- resilience and failure-case simulation
- operational observability and documentation

---

## Summary

Flux is no longer just an abstract idea. The repository has a real monorepo structure, local infrastructure, service bootstrap points, and a working gateway foundation. The next step is to turn that foundation into the actual business flows that define the quick-commerce platform itself.

The project is not “finished” as a product yet, but it is now meaningfully “started” in a realistic, extensible way.
