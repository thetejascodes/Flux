# ADR-0001: Database-per-Service vs Shared Database


## Context

Flux is built as a set of independently deployable microservices — Gateway, Catalog, Inventory, Order, Payment, Delivery, and Notification. Each service needs somewhere to persist its own data (users and sessions for Gateway, products for Catalog, stock and reservations for Inventory, and so on).

The most familiar starting point, coming from monolith development, is a single shared PostgreSQL database with one schema that every service reads and writes to directly. This is simpler to set up and query across, but it comes with a well-known cost in a microservices system: it quietly reintroduces the monolith's core problem — every service becomes coupled to every other service's table structure, and a schema change in one service can silently break another.

Two options were considered:

1. **One shared database, shared tables** — every service connects to the same database and can query any table directly.
2. **One database per service** — each service owns its own database, with its own schema, and can only be reached through its own API or the events it publishes. No service ever queries another service's tables directly.

## Decision

Flux uses **one logical database per service** (`gateway_db`, `catalog_db`, `inventory_db`, `order_db`, `payment_db`, `delivery_db`, `notification_db`), running as separate logical databases inside a single local Postgres container for development convenience, with the option to split them into fully separate managed Postgres instances in production (e.g. Neon) if warranted.

Each service:
- Defines its own Drizzle schema, scoped to only the tables it owns.
- Connects only to its own database via its own `DATABASE_URL`.
- Never queries another service's tables directly, even though they may physically live in the same Postgres server during local development.
- Exposes any data another service needs either through its own HTTP API (via the Gateway) or through events it publishes to the message broker.

For example, when Order Service needs to know if a product exists, it does not join against Catalog's `products` table — it either calls Catalog's API or relies on data passed in the event that triggered the order flow.

## Consequences

**Positive:**
- Services can evolve their schemas independently. Inventory can add a new column to `reservations` without any risk of breaking Order or Payment.
- Failure isolation extends to the database layer — a slow or overloaded Inventory database cannot degrade Catalog's read performance, since they are physically separate.
- This is what actually makes the system "true microservices" rather than a monolith split into folders that happens to run as separate processes. It is a defining test of the architecture, not a decorative detail.
- In production, each service's database can be scaled, backed up, and tuned independently based on its own access patterns (e.g. Inventory needs strong consistency for reservations; Notification barely needs a database at all).

**Negative / trade-offs accepted:**
- No cross-service SQL joins. Any "join" across service boundaries has to happen in application code, calling multiple services and combining the results — which is slower and more code than a single SQL query.
- Data duplication is sometimes necessary. If Order needs to display a product's name alongside an order line item, it may need to store a denormalized copy of that name at the time of order, rather than looking it up fresh from Catalog every time.
- Local development requires running and initializing multiple logical databases (`scripts/init-databases.sh`) instead of one, adding minor setup complexity.
- Transactions that span multiple services (e.g. "reserve stock AND create the order, atomically") are no longer possible as a single database transaction. This is precisely why the order saga (see the Order Service / Phase 2 design) exists — compensating transactions and event-driven coordination replace the atomicity a shared database would have given for free.

## Alternatives Considered

- **Shared database, shared tables:** rejected — this is the change that would silently turn Flux back into a monolith wearing a microservices costume, coupling every service to every other service's schema.
- **Shared database, separate schemas per service (same Postgres instance, `catalog.products`, `inventory.stock`, etc.):** considered as a middle ground, but rejected for the same underlying reason — it remains too easy to accidentally query across schema boundaries, and does not force the discipline of talking through APIs/events, which is the actual architectural property being protected here.