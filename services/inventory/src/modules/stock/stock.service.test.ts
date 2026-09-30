import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { stock, reservations } from "../../common/db/schema.js";
import { eq, and } from "drizzle-orm";

vi.mock("../../common/events/publisher.js", () => ({
  publish: vi.fn(),
}));

import { publish } from "../../common/events/publisher.js";
import { handleOrderCreated } from "./stock.gateway.js";

const PRODUCT_A = "11111111-1111-1111-1111-111111111111";
const PRODUCT_B = "22222222-2222-2222-2222-222222222222";
const WAREHOUSE_ID = "6193882b-fab5-4cde-9c0d-dd87b335c56e";

const upsertStock = async (
  productId: string,
  quantityAvailable: number,
) => {
  const [existing] = await db
    .select()
    .from(stock)
    .where(
      and(eq(stock.productId, productId), eq(stock.warehouseId, WAREHOUSE_ID)),
    );
  if (existing) {
    await db
      .update(stock)
      .set({ quantityAvailable, quantityReserved: 0 })
      .where(eq(stock.id, existing.id));
  } else {
    await db.insert(stock).values({
      productId,
      warehouseId: WAREHOUSE_ID,
      quantityAvailable,
      quantityReserved: 0,
    });
  }
  await db.delete(reservations).where(eq(reservations.productId, productId));
};

describe("handleOrderCreated partial compensation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await upsertStock(PRODUCT_A, 5); // enough stock
    await upsertStock(PRODUCT_B, 0); // no stock — this item will fail
  });

  it("releases already-reserved items and publishes one InventoryReservationFailed when a later item fails", async () => {
    const orderId = randomUUID();

    await handleOrderCreated({
      orderId,
      warehouseId: WAREHOUSE_ID,
      items: [
        { productId: PRODUCT_A, quantity: 1 },
        { productId: PRODUCT_B, quantity: 1 },
      ],
    });

    const [reservationA] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.productId, PRODUCT_A),
        ),
      );
    expect(reservationA).toBeDefined();
    expect(reservationA!.status).toBe("RELEASED");

    const reservationsB = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.productId, PRODUCT_B),
        ),
      );
    expect(reservationsB).toHaveLength(0);

    const [stockA] = await db
      .select()
      .from(stock)
      .where(
        and(eq(stock.productId, PRODUCT_A), eq(stock.warehouseId, WAREHOUSE_ID)),
      );
    expect(stockA!.quantityAvailable).toBe(5);
    expect(stockA!.quantityReserved).toBe(0);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("InventoryReservationFailed", {
      orderId,
    });
    expect(publish).not.toHaveBeenCalledWith(
      "InventoryReserved",
      expect.anything(),
    );
  });

  it("reserves all items and publishes InventoryReserved when every item has stock", async () => {
    await upsertStock(PRODUCT_B, 3); // give B stock too, for this test only
    const orderId = randomUUID();

    await handleOrderCreated({
      orderId,
      warehouseId: WAREHOUSE_ID,
      items: [
        { productId: PRODUCT_A, quantity: 1 },
        { productId: PRODUCT_B, quantity: 2 },
      ],
    });

    const orderReservations = await db
      .select()
      .from(reservations)
      .where(eq(reservations.orderId, orderId));

    expect(orderReservations).toHaveLength(2);
    for (const r of orderReservations) {
      expect(r.status).toBe("PENDING");
    }

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("InventoryReserved", { orderId });
  });
});