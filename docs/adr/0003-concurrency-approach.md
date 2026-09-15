# ADR-0003: Concurrency Control for Stock Reservations

## Context

The Inventory service must guarantee that stock is never oversold when multiple
customers attempt to reserve the same product/warehouse combination at the same
time. This is the core correctness requirement of `reserveStock()`.

There are two standard approaches to handling this kind of check-then-act
concurrency problem in a relational database:

1. **Pessimistic locking** — explicitly lock the stock row before reading it
   (e.g. `SELECT ... FOR UPDATE`), so no other transaction can read or modify
   it until the current transaction commits or rolls back.
2. **Optimistic concurrency via atomic conditional update** — perform the
   check and the update in a single atomic SQL statement, relying on the
   database engine's own statement-level atomicity rather than an explicit
   lock.

A decision was needed on which approach to use for `reserveStock()`,
`releaseReservation()`, and `confirmReservation()`.

## Decision

We use **optimistic concurrency via a single atomic conditional `UPDATE`**,
with no explicit row-level locking.

For `reserveStock()`, the check (`quantity_available >= quantity`) and the
write (decrementing `quantity_available`, incrementing `quantity_reserved`)
happen in one `UPDATE ... WHERE ... RETURNING` statement:

```sql
UPDATE stock
SET quantity_available = quantity_available - :quantity,
    quantity_reserved   = quantity_reserved + :quantity
WHERE product_id = :productId
  AND warehouse_id = :warehouseId
  AND quantity_available >= :quantity
RETURNING *;
```

If the `WHERE` clause's condition is no longer true by the time Postgres
evaluates it, the statement matches zero rows. The application checks
`updated.length === 0` and throws a clean `409 Conflict` ("Insufficient
stock") in that case, rather than a generic 500.

The same pattern — atomic, status-guarded `UPDATE ... RETURNING` — is used in
`releaseReservation()` and `confirmReservation()` to prevent a reservation
from being double-released or double-confirmed under concurrent calls. Both
guard on `status = 'PENDING'` in the `WHERE` clause, so only the first caller
to reach Postgres succeeds; any later, redundant call (e.g. a manual release
racing against the background expiry job) simply matches zero rows and is
treated as a no-op or conflict, never a duplicate state transition.

This relies on the fact that a single SQL statement in Postgres is always
atomic with respect to other transactions — no two concurrent `UPDATE`
statements against the same row can interleave their read and write steps.
Postgres serializes access to the row internally for the duration of the
statement, which is sufficient to prevent the race without the application
taking out an explicit lock.

## Alternatives Considered

**Pessimistic locking (`SELECT ... FOR UPDATE`)**

Read the stock row with an explicit lock, check the quantity in application
code, then issue a separate `UPDATE`. This was rejected for this use case
because:

- It introduces a window where the transaction holds a row lock while
  application code runs, increasing lock hold time and contention under load
  — directly counter to a quick-commerce system's low-latency goals.
- It raises the risk of deadlocks if multiple rows are locked in different
  orders across services or transactions.
- It requires the application to correctly manage the read-then-write
  sequence inside a transaction boundary, which is more error-prone than
  letting a single statement own the whole operation.
- It is unnecessary here: the conditional atomic `UPDATE` achieves the same
  correctness guarantee without an explicit lock, since the condition and
  the write are evaluated as one indivisible operation by Postgres.

**Read-then-write without any guard**

Read `quantity_available` in application code, compare in JavaScript, then
issue an unconditional `UPDATE`. This was never seriously considered as
viable — it is a classic time-of-check-to-time-of-use (TOCTOU) race and would
oversell stock under any real concurrent load. It is documented here only to
make explicit why "read, then decide, then write" as separate steps was
ruled out from the start.

## Evidence

The chosen approach was load-tested directly: 100 concurrent reservation
requests were issued against a single unit of stock (`quantity_available =
1`). Result:

- Exactly 1 request succeeded.
- 99 requests received a clean `409 Conflict` ("Insufficient stock").
- Zero overselling occurred.

The same atomic-update pattern was additionally exercised by the background
expiry job introduced after this milestone: a `PENDING` reservation was
allowed to pass its `expiresAt` with no manual action taken, and the job's
periodic `releaseReservation()` call correctly transitioned it to `RELEASED`
and restored the held stock, without colliding with any other in-flight
release or confirm operation.

## Consequences

**Positive**

- No explicit locks are held at any point, minimizing contention and
  avoiding deadlock risk entirely.
- The correctness guarantee is proven under real concurrent load, not just
  reasoned about.
- The pattern is simple and consistent: every state-changing operation on
  `stock` or `reservations` is a single atomic, conditionally-guarded
  statement. This same shape is reused across `reserveStock()`,
  `releaseReservation()`, `confirmReservation()`, and the expiry job's calls
  into `releaseReservation()`.
- Failure is cheap and clean: a losing request gets an immediate `409` rather
  than waiting on a lock.

**Trade-offs / things to watch**

- This approach assumes single-statement atomicity at the row level within
  one Postgres instance. It does not by itself extend to multi-row
  invariants (e.g. an operation that must atomically check/update two
  different stock rows) — such cases would need to be reconsidered if they
  arise later in the project (e.g. multi-warehouse allocation logic in
  Delivery).
- Every concurrent loser still reaches the database and consumes a
  connection/statement slot before failing, rather than being turned away
  earlier. Under extremely high contention on a single hot row, this could
  become a throughput concern; this has not yet been tested at a scale
  beyond the 100-concurrent-request milestone.
- Retry logic is intentionally not implemented at this layer — a `409` is
  surfaced directly to the caller (Order service, in Phase 2) to decide
  whether to retry, queue, or fail the order. This keeps Inventory's
  contract simple but pushes retry policy up the stack.
