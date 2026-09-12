# Flux

Flux is a distributed quick-commerce platform built as a monorepo of independently owned services. The repository is organized around a service-per-domain model: Gateway, Catalog, Inventory, Order, Payment, Delivery, and Notification, each with its own runtime, schema, and responsibilities.

This project is in an active foundation phase: the infrastructure is running locally, the gateway service is implemented, and the app is structured to evolve into a real multi-service commerce platform without a shared database across service boundaries.

---

## Current status

The repo now includes:

- Docker Compose infrastructure for Postgres, Valkey, RabbitMQ, and the gateway
- a database bootstrap script for local multi-database initialization
- a working TypeScript Express gateway service
- JWT-based auth primitives and OTP-related flows
- Drizzle schema setup and database integration for the gateway layer
- a clear service boundary strategy documented in the ADRs

This is not yet a full commerce product, but the base platform and service architecture are real and usable for local development.

---

## Architecture direction

Flux follows a database-per-service pattern instead of a single shared database. The rationale is documented in [docs/adr/0001-database-selection.md](docs/adr/0001-database-selection.md).

In practice:

- the gateway owns auth, session, and user-related data
- each future service owns its own database and schema
- communication between services is expected through HTTP and events rather than direct cross-service SQL access
- infrastructure services such as Postgres, Valkey, and RabbitMQ provide the runtime dependencies needed to build the platform

---

## Repository structure

```text
flux/
├── docker-compose.yml
├── README.md
├── docs/
│   └── adr/
│       └── 0001-database-selection.md
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
| Auth | JWT + email auth + OTP + Google OAuth hooks |

---

## Local infrastructure

The compose file starts the platform dependencies and the gateway service:

- PostgreSQL on `localhost:5432`
- Valkey on `localhost:6379`
- RabbitMQ on `localhost:5672`
- RabbitMQ management UI at `http://localhost:15672`
- Gateway on `http://localhost:4000`

The compose file currently includes the `gateway` service directly and leaves the other service blocks commented out until they have their own real runtime and `.env` files.

---

## Gateway status

The gateway is the most complete service in the repo right now.

### Included functionality

- Express app bootstrap with JSON parsing
- health check route at `/health`
- centralized environment config
- request validation middleware using Zod
- Drizzle + PostgreSQL integration
- JWT generation and refresh-token handling
- OTP request/verification flows
- Google auth route scaffold and callback wiring
- centralized API error handling

### Auth endpoints

The gateway exposes:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

These are wired in the gateway and are the starting point for the platform identity layer.

---

## Getting started

### 1) Create the gateway environment file

The gateway expects a `.env` file. Start from the example file:

```bash
cp services/gateway/.env.example services/gateway/.env
```

Then fill in the real values for:

- `DATABASE_URL`
- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_KEY`
- optional Twilio and Google credentials

The example file contains generation notes for JWT PEM keys.

### 2) Start the supporting infrastructure

```bash
docker compose up -d
```

This boots Postgres, Valkey, RabbitMQ, and the gateway container.

### 3) Start the gateway locally

```bash
cd services/gateway
npm install
npm run dev
```

### 4) Confirm it is healthy

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{ "status": "ok" }
```

---

## What is implemented vs. planned

### Implemented / foundation complete

- Docker local platform bootstrap
- PostgreSQL database initialization flow
- gateway HTTP server
- config and validation structure
- JWT and refresh-token logic
- OTP/auth route structure
- database-per-service design documentation

### Still planned

- product catalog service APIs
- inventory reservation and stock logic
- order orchestration and saga coordination
- payment processing
- delivery assignment and ETA logic
- notification/event consumer flows
- end-to-end checkout journeys
- full production-hardening and operational monitoring

---

## Design principles

Flux is intentionally designed to avoid the most common microservice anti-pattern: a single shared database hidden behind many folders. The system is built around:

- strict service ownership of data
- explicit service-to-service interfaces
- async communication where needed
- eventual consistency and orchestration patterns
- local developer ergonomics with dockerized infrastructure

---

## Roadmap

### Phase 1: Gateway and identity foundation

- finish auth/session flows and edge cases
- tighten validation and error handling
- document real env setup and deployment expectations

### Phase 2: domain service expansion

- build catalog APIs and inventory workflows
- begin order creation and orchestration
- wire messaging between services

### Phase 3: transactional business flows

- reservation, stock locking, and compensation paths
- payment processing and reconciliation
- delivery dispatch and tracking

### Phase 4: hardening

- e2e tests
- failure-mode simulation
- observability and production readiness

---

## Summary

Flux is now a real monorepo with a working local platform, a bootstrap-ready gateway, and a clear service-oriented architecture. It is no longer just a concept document; it has actual infrastructure, a running app foundation, and a defined path toward a full quick-commerce system.

The next step is to turn the existing gateway and infrastructure foundation into the first real domain services and business workflows.
