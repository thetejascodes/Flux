# Flux: Engineering Deep Dives

Evidence behind the claims in the [README](../README.md). Each section says what was built, how it was verified, and what is still open.

**Contents:** [Hardening](#hardening) · [CI](#ci-pipeline) · [Scaling](#multi-instance-scaling) · [Logging & tracing](#structured-logging--tracing) · [Cart & multi-item orders](#cart--multi-item-orders) · [Cart abandonment recovery](#cart-abandonment-recovery) · [Paid-order stock confirmation](#paid-order-stock-confirmation) · [Testing in detail](#testing-in-detail)

---

## Hardening

### Dead-letter queue

A RabbitMQ dead-letter exchange (`flux.events.dlx`) and queue (`flux.events.dlq`) are wired into every event-consuming service: Notification, Payment, Inventory, Delivery, and Order.

- `connection.ts` asserts the exchange and queue on connect.
- `subscriber.ts` binds every consumer queue to it via the `x-dead-letter-exchange` argument.
- A message that fails processing is retried once. If it fails again it is routed into `flux.events.dlq` with its original payload, routing key, and `x-death` headers intact, instead of being discarded.

**Verified:** a forced-failure test in Notification (handler made to throw) showed the message retried once, failed again, and sat in the DLQ with payload and headers intact. The same wiring was rolled out to the other four services, followed by a full saga re-run with no regressions.

### Rate limiting

The Gateway uses a Valkey-backed sliding-window limiter, applied before requests are proxied.

| Route group | Limit | Keyed by |
| --- | --- | --- |
| `/api/auth/*` | 10 requests / 60 s | Client IP |
| `/orders` | 30 requests / 60 s | Client IP |

OTP requests have a separate, stricter limit (3/hour per phone number) inside the OTP service.

**How it works.** Each client gets one sorted set per route group (`ratelimit:<prefix>:<ip>`). On every request the limiter:

1. Removes entries older than the window (trimmed by score, which is the timestamp).
2. Adds the request with its epoch-ms timestamp as score. The member is the timestamp plus a random suffix, so two requests in the same millisecond still count separately.
3. Counts the set (`ZCARD`). Over the limit → `429` with the standard error envelope, before any downstream logic runs.
4. Sets a key expiry equal to the window, so idle clients' keys disappear.

State lives in Valkey, so the limit holds across restarts and across multiple Gateway instances.

**Verified:** 12 rapid bad-password logins produced ten `401`s then two `429`s. Cross-checked in Valkey: `ZCARD` of 12, `TTL` counting down from 60, `ZRANGE ... WITHSCORES` showing one timestamped entry per request. Five authenticated `/orders` requests, well under the ceiling, all returned `201`.

```json
{"status":"error","message":"Too many requests. Please try again later.","data":null}
```

**Open:** `Retry-After` / `X-RateLimit-*` headers; multi-IP isolation check; Vitest coverage; `trust proxy` so the real client IP is used behind a load balancer.

### Role enforcement

A valid JWT proves identity; it does not grant elevated permissions.

1. `generateAccessToken` signs `{ userId, role }` into the JWT (RS256).
2. The Gateway's `isAuthenticated` middleware verifies it and sets `req.userId` and `req.userRole`.
3. The proxy forwards both as `x-user-id` and `x-user-role`.
4. The owning service enforces its own rule. Catalog's `requireAdmin` rejects `POST`/`PATCH /products` unless `x-user-role === "admin"`, returning `403`.

| Case | Result |
| --- | --- |
| Admin token → `POST /catalog/products` | `201`, product created |
| Fresh non-admin signup → same request | `403 Forbidden`, "Admin access required" |

Only Catalog's writes are gated today, since nothing else in the saga needs a role check yet.

### Health checks

Every `/health` runs a real dependency check instead of returning a hardcoded `200`.

| Service | Checks |
| --- | --- |
| Gateway, Catalog | Database (`SELECT 1`) |
| Inventory, Order, Payment, Delivery, Notification | Database + RabbitMQ channel |

```json
{"status":"ok","checks":{"database":"ok","rabbitmq":"ok"}}
```

If either check fails the endpoint returns `503` with `status: "degraded"` and a per-check breakdown. Verified live across all 7 services.

---

## CI pipeline

Each service has its own GitHub Actions workflow, triggered only by changes under `services/<name>/**`. Each run:

1. Starts disposable containers for what that service really depends on: Postgres always, RabbitMQ for the five event-driven services, Valkey for Gateway and Inventory.
2. Installs dependencies and compiles TypeScript.
3. Runs the committed Drizzle migrations against the fresh Postgres.
4. Runs the full Vitest suite against a real Postgres and, where a suite uses them, real RabbitMQ and Valkey containers.

The Gateway workflow also generates a throwaway RSA keypair with `openssl` each run and injects it as env vars, so nothing is hardcoded or persisted.

> **A bug this caught:** Inventory's concurrency test hung forever in CI until a `valkey` container was added. `reserveStock` writes to Redis after every reservation, and `ioredis` doesn't fail fast on a missing connection, so all 100 concurrent requests blocked silently. Raising the timeout didn't help; giving CI the dependency the code needs did.

No `lint` step yet.

---

## Multi-instance scaling

The zero-oversell guarantee holds across independent processes, not just within one.

Inventory was scaled to 3 replicas (`docker compose up -d --scale inventory=3`), and the standalone load test (`scripts/load-test-reservation.ts`) ran from a throwaway container targeting `http://inventory:4002`, a name Docker's DNS round-robins across all replicas.

| Check | Result |
| --- | --- |
| 100 concurrent reservations across 3 processes | Exactly 1 `201`, 99 clean `409`s, identical to the single-instance case |
| Source of the guarantee | The database's atomic `UPDATE ... WHERE quantity_available >= quantity`, not anything process-specific |

### The bug scaling exposed

Inventory's expiry job and Delivery's tracking job each run on a `setInterval` in their own process. With 3 replicas, 3 timers fired per interval, so up to 3 processes tried to sweep the same expired reservations, and only lower-level conflict handling hid the redundant work.

### The fix

Both jobs take a Postgres session-level advisory lock for the duration of their work. The lock is tied to a physical connection, so a dedicated connection is checked out of the pool and used for both acquire and release; otherwise the lock can silently leak.

```typescript
const client = await pool.connect();
let acquired = false;
try {
  ({ rows: [{ acquired }] } = await client.query(
    "SELECT pg_try_advisory_lock($1) as acquired",
    [LOCK_KEY],
  ));
  if (!acquired) return; // another instance already has this cycle

  // ...do the actual sweep/tick work...

} finally {
  if (acquired) {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
  client.release();
}
```

Each job uses its own lock key, so they never contend with each other.

**Verified live:** with 3 instances and a deliberately expired `PENDING` reservation inserted directly, only one instance logged the sweep:

```
inventory-2  | [expiry-job] auto-released 1 expired reservation(s)
```

Delivery's tracking job has the same fix, though it hasn't been load-tested at scale since Delivery isn't run with multiple replicas.

```bash
docker compose up -d --scale inventory=3
docker compose logs -f inventory
docker compose up -d --scale inventory=1   # scale back down
```

Inventory's compose entry has no fixed host port so it can be scaled; other services reach it over the Docker network.

---

## Structured logging & tracing

- **`common/logger.ts`** wraps pino. It reads `trace.getActiveSpan()` and stamps `traceId` and `spanId` onto every line, so callers never pass tracing info by hand.
- **`common/tracing.ts`** (identical across services) initializes OpenTelemetry and exports to Jaeger over OTLP. It loads before `server.ts` via Node's `--import` flag and calls `dotenv/config` itself, since it runs before the app's env loading.
- **RabbitMQ context propagation** is manual: the publisher injects the active trace into message headers, and the subscriber extracts it and wraps the handler so downstream spans join the same trace.
- **`errorHandler.ts`** (identical across services) logs exactly one structured line per error: `warn` with no stack for an expected 4xx, `error` with the full stack for an unexpected 5xx.

**Verified live.** One order's trace starts at the Gateway's `POST /orders` and runs through Order's synchronous Catalog lookup and every async hop: **7 services, 76 spans**.

```
gateway POST → order POST → order GET (60.87ms) → catalog GET (47.86ms)
                                                    → catalog request handler /products/:id
                                                        → pg-pool.connect (21.68ms)
                                                        → pg.query SELECT (13.83ms)
```

About 22 ms of Catalog's latency was a fresh Postgres connection (`pg` closes idle connections after 10 s), a cost that is invisible without a trace.

Expected errors produce a single clean line, correlated by `traceId`:

```json
{"level":40,"traceId":"7b011dc0...","status":401,"method":"POST","path":"/api/auth/login","msg":"Invalid email or password"}
{"level":40,"traceId":"bffc7815...","status":403,"method":"POST","path":"/products","msg":"Admin access required"}
```

---

## Cart & multi-item orders

`PlaceOrder` takes a `warehouseId` and an array of `{ productId, quantity }`. A persisted server-side cart sits in front of checkout.

### Schema

| Table (DB) | Notes |
| --- | --- |
| `cart_items` (Order) | `userId`, `productId`, `quantity`. No price column, so there is nowhere for a stale price to hide. Unique `(userId, productId)` makes add-to-cart a safe upsert. |
| `order_items` (Order) | One row per line, with `unitPrice` snapshotted from Catalog at checkout. |
| `orders` | Single-product columns removed. `subtotal`, `shippingFee` (free above a threshold), and `totalAmount` added. |
| `reservations` (Inventory) | Already one row per `(orderId, productId)`. A unique constraint on that pair was added as a safety net against redelivered events. |

### Checkout flow

`POST /orders` fetches each item's price from Catalog in parallel, computes totals server-side (the client never sends a price), and inserts the order and every line item in one `db.transaction`. `InventoryReserved`, `InventoryReservationFailed`, and `ReleaseReservation` now carry only `{ orderId }`: Order never tracked individual reservations, and Inventory owns those details. Payment's idempotency key became the order ID, since it is the order that must not be double-charged.

### Partial compensation

If item 1 of 2 reserves and item 2 lacks stock, Inventory releases item 1 before publishing a single `InventoryReservationFailed` for the order. Items are reserved sequentially so the handler always knows exactly what to roll back. If a release fails during compensation, it is logged and the loop continues, so one bad release can't leave other items' stock held.

Proven at three levels:

1. **Unit test:** first item ends `RELEASED`, second never gets a row, stock counters restored, failure event fired exactly once.
2. **CI:** the same test against real Postgres and RabbitMQ on every push.
3. **Live in Docker:**

```
{"msg":"item reserved","productId":"8ac6fe5d...","reservationId":"36475f27..."}
{"msg":"insufficient stock for item, compensating","productId":"1ef965e9..."}
[rabbitmq] published event: InventoryReservationFailed
```

Confirmed by querying the database directly, not just logs:

```
 product_id                            | status
----------------------------------------+----------
 8ac6fe5d-9f5f-4f6a-ab68-3bae630b2d06   | RELEASED

 quantity_available | quantity_reserved
---------------------+--------------------
                  10 |                  0
```

The happy path (both items reserved, paid, delivered, tracked live) was verified on a single trace, with Notification alerts firing in order at each stage.

### Cart endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/cart` | The user's items (empty array, not an error, for an empty cart) |
| `POST` | `/cart` | Add a product; if present, increments via one atomic `INSERT ... ON CONFLICT DO UPDATE` |
| `PATCH` | `/cart/:productId` | Set quantity to an exact value |
| `DELETE` | `/cart/:productId` | Remove the item |

Every mutation is scoped to `(userId, productId)`; a test proves user A cannot alter user B's cart by guessing a `productId`.

**Two integration bugs found only by testing through the real Gateway → Order path:**

1. The Gateway's proxy strips the mount path, so `/cart` reached Order as `/`. It worked for `/orders` (mounted at root) but broke `/cart`. Fixed with an optional `pathRewrite` argument on `proxyTo`.
2. In Order, `orderRoutes` had a `GET /:id` wildcard registered before `cartRoutes`, so `GET /cart` matched `id = "cart"` and crashed on `invalid input syntax for type uuid`. Fixed by mounting `cartRoutes` first.

**Open:** no Catalog batch lookup yet (n items → n parallel calls); `getOrderById` doesn't return `order_items`; cart items aren't validated against Catalog at add time (checkout still rejects unknown products).

---

## Cart abandonment recovery

A background job in Order finds carts that went quiet and has Notification remind the customer, once per stretch of cart activity.

### How it works

Every sweep (default every 60 seconds), Order:

1. Takes a Postgres advisory lock (`pg_try_advisory_lock(1003)`) on a **dedicated connection**, so several Order instances never sweep in the same cycle. This is the same pattern as Inventory's expiry job.
2. Runs one query: group `cart_items` by user, keep users whose newest `updated_at` is older than N minutes (default 30, configurable), and left-join `cart_reminders` so a user is picked only if they have no reminder row **or** their latest activity is newer than the activity they were last reminded about.
3. For each user, publishes `CartAbandoned { userId, items, lastActivity }`, **then** upserts `cart_reminders`.

Notification consumes `CartAbandoned` and stores a `CART_ABANDONED` notification (stub mode, like the other types).

### Design decisions

| Decision | Why |
| --- | --- |
| **Abandoned is per user**, measured by the newest `updated_at` across all of that user's cart rows | Adding to one item keeps the whole cart "alive". |
| **Dedup state in `cart_reminders`**, keyed by `userId`, storing `remindedActivityAt` | New activity makes `lastActivity` newer than the stored value, which re-arms the reminder with no reset job. |
| **Publish first, then upsert** | If the upsert fails, the next sweep republishes and Notification's dedup key absorbs the duplicate. The reverse order could leave a customer who is never reminded, and nothing could recover that. |
| **`lastActivity` travels as text** | Postgres timestamps keep microseconds, a JS `Date` keeps milliseconds. Round-tripping through a `Date` would store a slightly smaller value and make "reminded < latest activity" true forever. |
| **Notification dedups on `dedupKey`**, not `(orderId, type)` | A cart has no order. `orderId` became nullable (Postgres unique indexes treat NULLs as distinct, so the existing order rule is untouched) and cart reminders dedupe on `CART_ABANDONED:<userId>:<lastActivity>`. |
| **Per-user try/catch** | One bad user never aborts the batch; the next sweep retries them. |

Config (Order, all optional): `CART_ABANDON_MINUTES` (30), `CART_SWEEP_INTERVAL_MS` (60000), `CART_SWEEP_BATCH_SIZE` (100).

### Two gaps found in the existing code and fixed

1. **Checkout never cleared the cart.** `placeOrder` read items from the request body and never touched `cart_items`, so the job would have reminded people who had already bought. `placeOrder` now deletes the ordered products' cart rows **inside the same transaction** as the order insert: a failed order keeps the cart, a committed order always clears it.
2. **`updatedAt` is set explicitly** (`now()`) on both the add-to-cart conflict path and `updateCartItemQuantity`, each with a Vitest case, so the staleness query never depends on an ORM hook.

### Verified

**Vitest, real Postgres.** Sweep: a stale cart is reminded once across two sweeps; a fresh cart is skipped; new activity re-arms the reminder; a user whose cart was emptied is skipped. Order: checkout removes ordered products and keeps the rest. Notification: one row per `(userId, lastActivity)` even when redelivered, and a second row for newer activity.

**Live, in Docker** (threshold 1 minute, 10-second sweep):

```
order         | cart abandonment job started  (intervalMs 10000, abandonAfterMinutes 1)
order         | [rabbitmq] published event: CartAbandoned
notification  | handling CartAbandoned
notification  | [notification][DEV] ... You left 2 item(s) in your cart.
```

- Later sweeps stayed silent and row counts did not grow, so nothing was reminded twice.
- Adding to the same cart again moved `cart_reminders.reminded_activity_at` forward and produced a second `CART_ABANDONED` notification with a different `dedup_key`.
- Placing an order for one of two carted products left only the other in `cart_items`, confirmed through Gateway (`GET /cart`) and by a direct query.

**Open:** the cart is cleared when the order is **created**, not when payment succeeds, so a saga that later fails leaves the customer with an empty cart (clearing on `PaymentSucceeded` would fix it); reminders are stub-mode until the phone-lookup step; the sweep under several Order replicas has not been run live.

---

## Paid-order stock confirmation

A bug found only by running the system and watching one order for ten minutes.

**What was wrong.** Inventory reserves stock when an order is created and marks the reservation `PENDING` with a 10-minute expiry. Nothing ever told Inventory that the order was paid. After a delivered order, its reservation stayed `PENDING`, and the expiry job released it:

```
reservation PENDING (order CONFIRMED and delivered)
...
00:42:19  RELEASED      bread: 200 available, 0 reserved
```

The sold unit went back on the shelf. The 100-concurrent-request test still passed, because it checks that reservations can't exceed stock at one moment, not that a sale stays subtracted.

**The fix.** Inventory now subscribes to `PaymentSucceeded` and runs `confirmReservationsByOrderId`: in one transaction it sets the order's `PENDING` reservations to `CONFIRMED` and reduces `quantity_reserved` by each one's quantity, leaving `quantity_available` alone. Only `PENDING` rows change, so a redelivered event is a no-op, and the expiry job only selects `PENDING` rows, so it never releases a confirmed one.

**Verified.** Three Vitest cases (confirm and keep the unit sold, redelivery changes nothing, another order's reservation is untouched). Live: one order, reservation `CONFIRMED`, bread 199 available and 0 reserved, then watched for 14 minutes across the 10-minute expiry with the job running every 60 seconds; every line stayed `CONFIRMED` and 199.

**Open:** a payment slower than the 10-minute reservation window would let the reservation expire first. The simulated payment takes milliseconds, so this is not exercised today.

---

## Testing in detail

96 tests across 7 services; 5 real bugs found and fixed by the suite along the way. Every saga-facing gateway was refactored into named, independently testable handlers, and the full live saga was re-verified afterward, including a fixed idempotency-key scoping bug.

**Gateway (5 suites).**
- `auth.service.test.ts`: signup, duplicate rejection, login with an identical error for bad password and unknown email (prevents account enumeration), refresh rotation invalidating the old token, ~7-day session expiry.
- `otp.service.test.ts`: 3/hour limit scoped per phone, codes stored only as hashes, new vs existing user, rejection of wrong, expired, consumed, and never-requested codes.
- `google-auth.service.test.ts`: auth URL params, both Google HTTP calls succeeding and failing, new vs existing identity, no stray user row on failure.
- `otp.test.ts`: the Twilio wrapper alone: stub mode skips Twilio, live mode sends the exact payload, Twilio errors propagate.
- `auth.middleware.test.ts`: valid token sets `req.userId`; missing or malformed header gets a `401`; verification errors such as expiry reach the error handler.

**Inventory.** A real 100-concurrent-request test against 1 unit of stock: exactly 1 success, 99 conflicts, none failing for unrelated reasons. The same scenario also runs as a standalone HTTP load test against a live instance. A separate suite covers the multi-item `OrderCreated` handler, both the compensation and happy paths. The concurrency test lives in its own file, `stock.concurrency.test.ts`, separate from the compensation tests, so one can't be overwritten while editing the other. The expiry job is verified live (see Multi-instance scaling), not by a Vitest test. Reservation confirmation on payment is covered by stock.confirm.test.ts (confirm, redelivery, and isolation from other orders).

**Payment.** Same `idempotencyKey` twice returns the same row and outcome; a different key for the same order creates an independent row, so a legitimate retry after a failure isn't blocked. `handleChargePayment` publishes a compensating `PaymentFailed` on validation failure instead of dropping the event, and catches thrown errors.

**Order.** Pricing against a mocked Catalog for single and multiple items (this caught the `.toFixed()` rounding bug), a Catalog-unreachable case, and all four saga handlers called as real imported functions. A second suite covers the cart: upsert increments rather than duplicating, update sets an exact value, and update/remove return not-found for both nonexistent items and another user's items. The cart suite also checks that both add-to-cart and update bump `updatedAt`. A third suite covers the abandonment sweep (stale reminded once, fresh skipped, re-armed by new activity, emptied cart skipped), and `placeOrder` has a test that checkout removes ordered products and keeps the rest.

**Catalog (12 tests).** Creation with exact two-decimal prices, existing and missing lookups, filtered and unfiltered listing, pagination, empty results, partial updates that preserve unspecified fields, price updates without float corruption, and not-found updates.

**Delivery.** 10 concurrent requests against 1 driver → exactly 1 success. If the delivery insert fails after the driver is claimed, the claim rolls back and the driver stays `AVAILABLE`. Two drivers at different distances → the nearer one is chosen.

**Notification.** A database-level unique constraint on `(orderId, type)`, verified for repeated calls and for a genuine redelivery of `PaymentSucceeded`; different types for one order remain independent rows. Cart reminders are covered separately: one row per `(userId, lastActivity)` under redelivery, and a new row when `lastActivity` is newer.