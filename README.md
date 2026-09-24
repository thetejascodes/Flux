# Flux

> _One order. Six services. Zero excuses._

Flux is a distributed quick-commerce platform built as a monorepo of independent services. The goal is to model the core problems behind modern order systems — inventory reservation under concurrency, service-to-service coordination, delivery routing, and failure recovery — without a single shared database.

Most portfolio e-commerce projects are a product table, a cart, and a checkout form. Flux exists to demonstrate something different: that a single engineer can design and reason about the same category of hard problems that companies like Amazon and Flipkart solve at scale, without needing a team of thousands to prove it.

## Status

✅ **All seven planned services are complete, and the full hardening test suite is done.** Gateway, Catalog, Inventory, Order, Payment, Delivery, and Notification are all built, dockerized, and proven working end-to-end, including the full choreographed saga (success and compensation paths), real Catalog-based pricing, geospatial nearest-driver assignment with live WebSocket tracking, event-driven customer notifications, and distributed tracing across every hop.

**Testing is fully closed out.** 70 automated tests pass across all 7 services, 5 real bugs were found and fixed in the process, every saga-facing gateway was refactored into named, independently testable handlers, and the full live saga — success and compensation paths — was re-verified end-to-end post-refactor, including a fixed idempotency-key scoping bug.

**Now in post-testing hardening.** With testing closed, the project has moved into a staged hardening and feature plan: closing documented reliability gaps first (dead-letter queueing, rate limiting, role enforcement, real health checks), then CI, then scale/observability proof, then a cart-based feature set (loyalty, reviews, recommendations, real payments). A RabbitMQ dead-letter exchange has been added and verified end-to-end for the Notification service — failed events are no longer silently discarded after one retry; they're preserved in `flux.events.dlq` with full payload and failure metadata intact. Rollout to the remaining event-consuming services (Inventory, Delivery, Payment, Order) is in progress.

**Notification Service** listens to the same RabbitMQ exchange every other service publishes to — `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, `DeliveryAssigned` — and logs a customer-facing alert for each, idempotently (a unique constraint on `orderId` + notification type prevents duplicate alerts if an event is redelivered). It currently runs in stub mode (console + database log, same pattern as Gateway's own OTP stub mode) rather than sending real SMS; the Twilio integration itself is fully wired and ready, gated behind a single config flag, waiting only on a phone-number-resolution step that hasn't been built yet.

ADR-0001 through ADR-0005 are complete and accepted. **Phases 0 through 3 are fully closed**, and Phase 2's previously-open test-coverage gaps are now closed as part of the 70-test hardening pass. A frontend dashboard (optional, deprioritized), a case study write-up, and deployment remain, alongside the staged hardening/feature plan now underway.

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
- **Failure is a first-class case.** If payment fails after inventory succeeds, the system compensates — it doesn't leave the order in a broken half-state. Proven under genuine random failures, not just simulated on demand. Failed events themselves are no longer silently dropped either — a dead-letter queue now preserves anything that fails processing, instead of discarding it after one retry.
- **Built for quick-commerce, not generic e-commerce.** Multiple dark-store/warehouse locations, nearest-driver assignment by real distance calculation, and live delivery tracking over WebSocket.
- **Observable by design.** A single order's journey across every service it touches is visible as one connected trace, not five separate log streams.

---

## Architecture

Each service owns its own PostgreSQL database. Synchronous calls are used only for two cases: Gateway's authenticated proxy, and Order's single price lookup from Catalog at placement time. Everything else — order state changes, payment confirmations, delivery assignment, live position updates, customer notifications — flows as events through RabbitMQ, or in Delivery's case, out to the browser over WebSocket.

**The full proven saga, six services deep:**

`POST /orders` → Order looks up real Catalog pricing, writes `PENDING`, publishes `OrderCreated` → Inventory atomically reserves stock, publishes `InventoryReserved` → Order updates to `STOCK_RESERVED`, publishes `ChargePayment` with the real amount → Payment simulates a charge, publishes `PaymentSucceeded`/`PaymentFailed` → on success, Order finalizes to `CONFIRMED` and publishes `AssignDelivery` (reusing the warehouse Inventory already reserved against) → Delivery atomically claims the nearest available driver by real Haversine distance, publishes `DeliveryAssigned` → a background simulation moves that driver toward the warehouse every 5 seconds, broadcasting live position updates over WebSocket to any subscribed client, until the delivery reaches `DELIVERED`.

Running alongside all of this, entirely passively: **Notification** hears `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`, and `DeliveryAssigned` the moment they're published, and logs a corresponding customer alert for each — with no code changes required in any of the services actually producing those events.

On payment failure: Order publishes `ReleaseReservation` instead, and Inventory releases the held stock — confirmed via direct database query, independently, more than once.

**Failure handling at the transport level:** every service's RabbitMQ consumer queues are now (or are being) bound to a shared dead-letter exchange, `flux.events.dlx`. A message that fails processing is retried once; if it fails again, it's routed — with its original payload, routing key, and failure metadata (`x-death` headers) intact — into `flux.events.dlq`, rather than being discarded. This is currently verified end-to-end for Notification, with the same wiring being rolled out to Inventory, Delivery, Payment, and Order.

See [ADR-0004](docs/adr/0004-saga-choreography.md) for the choreography-vs-orchestration reasoning, and [ADR-0005](docs/adr/0005-geospatial-routing.md) for the geospatial routing decision.

---

## Repository Structure

A single monorepo, not seven separate repos — each service is still fully independent (own dependencies, own database, own Dockerfile), just co-located for easier solo development.