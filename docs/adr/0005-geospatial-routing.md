# ADR-0005: Geospatial Routing Approach — Haversine vs PostGIS

**Status:** Accepted
**Date:** 2026-09-18

## Context

Delivery Service needs to answer a nearest-neighbor question for every
confirmed order: which available delivery driver is closest to the
warehouse the order is shipping from, so that driver can be dispatched.

Two approaches were considered for computing geographic distance:

1. **PostGIS** — a PostgreSQL extension providing native geographic
   data types, spatial indexing (GIST), and distance functions
   (`ST_Distance`, `ST_DWithin`) that can efficiently query "nearest N
   points" even across millions of rows.
2. **Plain Haversine formula in application code** — compute
   great-circle distance between two lat/lng points directly in
   TypeScript, applied over the result of a normal SQL query with no
   spatial extension involved.

A related, earlier question was **which warehouse** to ship from in the
first place. This ADR also documents that decision, since it shapes how
the geospatial logic is actually used.

## Decision

**Which warehouse ships the order is not re-derived by Delivery at all.**
Inventory already makes this decision the moment it reserves stock for an
order — the `warehouseId` on `InventoryReserved` (and, subsequently, on
`AssignDelivery`) is Inventory's existing, already-correct answer to
"which warehouse has the stock." Delivery trusts this value rather than
running its own "nearest warehouse with stock" query, which would
duplicate a decision another service already made and risk it
disagreeing with which warehouse Inventory actually reserved against.

**The one genuinely open geospatial question — which available driver to
dispatch — is answered with the Haversine formula computed in
application code, not PostGIS.**

The actual query pattern: fetch every driver with `status = 'AVAILABLE'`
(a plain `WHERE` clause), then compute Haversine distance from the
warehouse's location to each candidate driver's current location in
application code, and pick the minimum.

```typescript
const haversineDistanceKm = (
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number => {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};
```

The driver assignment itself is claimed atomically — an `UPDATE ...
WHERE id = :driverId AND status = 'AVAILABLE' RETURNING *` — so that if
two deliveries are assigned concurrently and both compute the same
nearest driver, only one successfully claims them; the other gets zero
rows back and fails cleanly rather than double-booking a driver. This is
the same atomic-conditional-update pattern used throughout Flux
(Inventory's `reserveStock`, Payment's idempotent `chargePayment`).

## Consequences

**Positive:**
- No new infrastructure dependency. PostGIS must be explicitly enabled
  per-database and isn't universally supported by managed Postgres
  providers at every tier — including some being considered for Flux's
  eventual deployment (e.g. Neon). Avoiding it keeps the deployment
  story simpler and matches the database-per-service model without
  adding an extension that would need to be re-verified on every
  service's database.
- The problem size doesn't warrant it. At this project's scale — a
  candidate set of drivers numbering in the tens to low hundreds per
  query, not millions of geo-points — a full scan with an in-memory
  Haversine computation is effectively instant. PostGIS's real
  advantage, spatial indexing for fast nearest-neighbor search over
  large datasets, has nothing to optimize here.
- Reusing Inventory's warehouse decision instead of re-deriving it
  eliminates an entire class of potential inconsistency: there is no
  scenario where Delivery ships from a different warehouse than the one
  that actually reserved the stock, because Delivery never makes that
  choice at all.
- Full geodesic accuracy is not required for this use case — Haversine's
  small margin of error (Earth's non-spherical shape) is irrelevant at
  delivery-radius distances (kilometers, not thousands of kilometers).
- Verified under a real test: given two available drivers at known
  coordinates, the closer driver (by actual computed distance, roughly
  1.12 km vs. 1.35 km from the warehouse) was correctly selected, not
  simply the first row returned by the query.

**Negative / trade-offs accepted:**
- Does not scale to a large number of candidate drivers. If Flux's
  driver count grew into the thousands, computing Haversine distance
  against every available row in application code would become a
  genuine bottleneck — this is the point at which PostGIS's spatial
  indexing would become the correct choice, not before.
- No native support for more advanced spatial queries a real system
  might eventually want — e.g. "is this address within our delivery
  zone polygon" — which PostGIS handles natively and Haversine-only code
  cannot express without significant additional logic.
- Reusing Inventory's warehouse decision means Delivery has no
  independent ability to re-route an order to a different warehouse if,
  for example, the originally reserved warehouse turns out to have no
  available drivers nearby. Today, if no driver is `AVAILABLE` at all,
  assignment simply fails with a `409 Conflict` and is retried once by
  the subscriber's standard retry logic; there is no fallback to a
  second-nearest warehouse.
- This decision would need to be revisited, not merely extended, if
  Flux's driver density genuinely grew, or if multi-warehouse fallback
  routing became a real requirement — it is explicitly scoped as
  correct for this project's current scale and saga design, not a
  permanent architectural ceiling.

## Alternatives Considered

- **PostGIS with spatial indexing**: rejected for now — the correct
  tool at real scale, but adopting it here would be solving a scale
  problem Flux doesn't actually have, at the cost of deployment
  complexity and an additional dependency every service's database
  would need to account for.
- **Delivery independently re-deriving nearest-warehouse-with-stock**:
  rejected — this would require Delivery to either query Inventory's
  stock data directly (violating the database-per-service boundary) or
  duplicate stock-awareness logic that already exists and is already
  correct in Inventory. Trusting the `warehouseId` already decided upon
  and passed through the event chain is simpler and cannot disagree
  with the warehouse that actually holds the reservation.
- **A dedicated geospatial search service** (e.g. Elasticsearch's geo
  queries): rejected as significant over-engineering for a candidate
  set this small — introduces an entire additional piece of
  infrastructure to solve a problem a few lines of application code
  already solve correctly at this scale.
  