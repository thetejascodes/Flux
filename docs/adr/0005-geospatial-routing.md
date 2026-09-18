# ADR-0005: Geospatial Routing Approach — Haversine vs PostGIS

**Status:** Accepted
**Date:** 2026-09-18

## Context

Delivery Service needs to answer two "nearest" questions for every order: which warehouse (with available stock for the ordered product) is closest to the customer, and which available delivery driver is closest to that warehouse. Both are nearest-neighbor problems over a set of latitude/longitude points.

Two approaches were considered:

1. **PostGIS** — a PostgreSQL extension providing native geographic/geometric data types, spatial indexing (GIST), and distance functions (`ST_Distance`, `ST_DWithin`) that can efficiently query "nearest N points" even across millions of rows.
2. **Plain Haversine formula in application code** — compute great-circle distance between two lat/lng points directly in TypeScript, applied over the result set of a normal SQL query with no spatial extension involved.

## Decision

Flux uses **the Haversine formula computed in application code**, not PostGIS.

The actual query pattern is: fetch all warehouses that currently hold stock for the ordered product (a plain `WHERE` clause against the `stock` table, already proven correct in Inventory), then compute Haversine distance from the customer's location to each candidate warehouse in application code, and pick the minimum. The same pattern applies to selecting the nearest available delivery driver from the pool of drivers with `status = 'AVAILABLE'`.

```typescript
function haversineDistance(lat1, lon1, lat2, lon2): number {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
```

## Consequences

**Positive:**
- No new infrastructure dependency. PostGIS must be explicitly enabled per-database and isn't universally supported by managed Postgres providers at every tier — including some being considered for Flux's eventual deployment (e.g. Neon). Avoiding it keeps the deployment story simpler and matches the database-per-service model without adding an extension that would need to be re-verified on every service's database.
- The problem size doesn't warrant it. At this project's scale — a candidate set of warehouses or drivers numbering in the tens to low hundreds per query, not millions of geo-points — a full scan with an in-memory Haversine computation is effectively instant. PostGIS's real advantage, spatial indexing for fast nearest-neighbor search over large datasets, has nothing to optimize here.
- Keeps the "nearest warehouse with stock" query as one ordinary SQL query (filter by product/stock) plus a small amount of application logic, rather than requiring a combined spatial-and-relational query, which is simpler to reason about and test.
- Full geodesic accuracy is not required for this use case — Haversine's small margin of error (Earth's non-spherical shape) is irrelevant at delivery-radius distances (kilometers, not thousands of kilometers).

**Negative / trade-offs accepted:**
- Does not scale to a large number of candidate points. If Flux's warehouse or driver count grew into the thousands, computing Haversine distance against every row in application code would become a genuine bottleneck — this is the point at which PostGIS's spatial indexing would become the correct choice, not before.
- No native support for more advanced spatial queries a real system might eventually want — e.g. "is this address within our delivery zone polygon" — which PostGIS handles natively and Haversine-only code cannot express without significant additional logic.
- This decision would need to be revisited, not merely extended, if Flux's warehouse/driver density genuinely grew — it is explicitly scoped as correct for this project's scale, not a permanent architectural choice.

## Alternatives Considered

- **PostGIS with spatial indexing**: rejected for now — the correct tool at real scale, but adopting it here would be solving a scale problem Flux doesn't actually have, at the cost of deployment complexity and an additional dependency every service's database would need to account for.
- **A dedicated geospatial search service** (e.g. Elasticsearch's geo queries): rejected as significant over-engineering for a candidate set this small — introduces an entire additional piece of infrastructure to solve a problem a few lines of application code already solve correctly at this scale.