# ADR-0004: Saga Pattern — Choreography vs Orchestration

## Status
Accepted

## Context

The order lifecycle (Order → Inventory → Payment, with compensation on
failure) spans three independently-owned databases. No single ACID
transaction can span all three, so a distributed saga is required: a
sequence of local transactions, each with a corresponding compensating
transaction to undo it if a later step fails.

There are two standard ways to implement a saga:

1. **Choreography** — each service publishes events describing what it did,
   and other services subscribe to the events they care about and react
   independently. There is no central coordinator; the sequence of steps
   emerges from each service's own event subscriptions.
2. **Orchestration** — a single coordinating service (an "orchestrator")
   explicitly calls each participant in sequence, tracks the saga's overall
   state itself, and issues compensating calls on failure.

A decision was needed on which shape to build Order, Inventory, and
Payment's saga interactions around.

## Decision

We use **choreography**, implemented via a shared RabbitMQ topic exchange
(`flux.events`) that every participating service publishes to and
subscribes from.

Concretely: Order publishes `OrderCreated` and has no further involvement
until something else emits an event it has subscribed to. Inventory reacts
to `OrderCreated` independently, attempts a reservation, and publishes
`InventoryReserved` or `InventoryReservationFailed` — it has no awareness
that "Order" or "Payment" exist as concepts; it only knows about event names
and payload shapes. Order reacts to `InventoryReserved` by publishing
`ChargePayment`. Payment reacts to `ChargePayment` and publishes
`PaymentSucceeded` or `PaymentFailed`. Order reacts to either of those as
the final step, either confirming the order or publishing
`ReleaseReservation` as a compensating action, which Inventory reacts to by
undoing its earlier reservation.

No service directly calls another service's API as part of this flow. Every
transition is driven by publishing and subscribing to named events on the
shared exchange, using the generic `publish()`/`subscribe()` wrapper shared
across all three services' `common/events/` modules.

## Alternatives Considered

**Orchestration (a dedicated coordinator)**

A separate component — or a designated role played by Order itself — would
explicitly call Inventory's reservation endpoint, wait for the result, then
call Payment's charge endpoint, wait for that result, and explicitly issue a
compensating call to Inventory if Payment failed. This was rejected for this
project because:

- It re-introduces synchronous, chained HTTP calls between services for the
  core saga flow — exactly what event-driven architecture is meant to avoid
  (see the project's stated principle: "event-driven, not request-chained").
  A slow or temporarily unavailable Payment service would directly stall or
  fail the orchestrator's request chain.
- The orchestrator would need to know about every participant's API shape
  and calling convention, coupling it tightly to all three services. Adding
  a fourth saga step (e.g. Delivery, in Phase 3) means modifying the
  orchestrator's code directly, rather than a new service simply
  subscribing to an existing event.
- It concentrates saga logic and failure handling into a single component,
  which becomes a more complex piece of code to reason about and test in
  isolation, and a single point of coordination failure.

Orchestration is a reasonable and often-preferred choice for sagas with many
steps, complex conditional branching, or where a single team needs full
visibility into the flow from one place. For a saga this size, with clear
one-directional event flow and only one compensating action, choreography's
simplicity outweighs orchestration's centralized visibility.

## Evidence

The choreographed saga was implemented and tested live, in Docker, across
all three services and their independent databases, with no synchronous
service-to-service calls involved in the flow:

- **Success path**, run repeatedly: `OrderCreated → InventoryReserved →
  ChargePayment → PaymentSucceeded`, ending with the order's own database
  row reaching `status: CONFIRMED`, `reservationId` and `paymentId`
  populated. Verified via direct API fetch after each event completed.
- **Failure / compensation path**, triggered by Payment's simulated ~10%
  failure rate: `OrderCreated → InventoryReserved → ChargePayment →
  PaymentFailed → ReleaseReservation`, ending with the order's row at
  `status: PAYMENT_FAILED` and, critically, the corresponding row in
  Inventory's independent `reservations` table transitioning to
  `status: RELEASED` — confirmed by direct database query, not just
  application-level logs.
- Both paths were observed occurring naturally within the same continuous
  batch of test requests, with no code branching required to force either
  outcome — the same request body produced both outcomes across repeated
  attempts, exactly as a real payment gateway's occasional decline would
  behave.

## Consequences

**Positive**

- Each service remains genuinely independent: Inventory and Payment have no
  code referencing each other, or even referencing Order's internal
  concepts beyond an opaque `orderId`. A service can be taken down, restart,
  and pick up a durably-queued event without any other service needing to
  know or care.
- Adding a new participant to the saga later (e.g. Delivery reacting to
  `PaymentSucceeded` to begin assignment) requires no changes to Order,
  Inventory, or Payment's existing code — only a new subscriber in the new
  service.
- The compensating transaction (`ReleaseReservation`) is a normal event like
  any other, handled by Inventory's existing event-handling machinery — no
  special "rollback" code path was needed.

**Trade-offs / things to watch**

- There is no single place to read and understand the full saga flow end to
  end — it is implicit in the union of every service's individual
  subscriptions. This is the direct trade-off against orchestration's
  centralized visibility, and is the specific gap distributed tracing
  (OpenTelemetry + Jaeger, planned) is meant to address: one trace spanning
  Order → Inventory → Payment gives back the end-to-end visibility that
  choreography does not provide by default.
- Each service currently retries a failed event handler at most once before
  discarding the message (see `subscriber.ts`'s redelivery check). This is
  sufficient for the failure modes tested so far, but a longer-lived outage
  in any one service could still result in a dropped event with no
  automatic recovery beyond that single retry — a dead-letter queue would
  be the natural next hardening step if this becomes a real concern.
- Pricing (`amount` in `ChargePayment`) is currently a fixed placeholder
  rather than looked up from Catalog. This does not affect the correctness
  of the choreography itself, but it means the saga has not yet been
  exercised with real, varying transaction amounts.