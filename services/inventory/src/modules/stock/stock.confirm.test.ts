import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { stock, reservations } from "../../common/db/schema.js";
import {
  reserveStock,
  confirmReservationsByOrderId,
} from "./stock.service.js";

// If this insert complains about a missing column, copy the seeding code from
// stock.concurrency.test.ts instead.
const seedStock = async (quantityAvailable: number) => {
  const productId = randomUUID();
  const warehouseId = randomUUID();
  await db.insert(stock).values({
    productId,
    warehouseId,
    quantityAvailable,
    quantityReserved: 0,
  });
  return { productId, warehouseId };
};

const readStock = async (productId: string, warehouseId: string) => {
  const [row] = await db
    .select()
    .from(stock)
    .where(
      and(eq(stock.productId, productId), eq(stock.warehouseId, warehouseId)),
    );
  return row!;
};

describe("confirmReservationsByOrderId", () => {
  it("confirms the reservation and moves the unit from reserved to sold", async () => {
    const { productId, warehouseId } = await seedStock(5);
    const orderId = randomUUID();
    await reserveStock({ productId, warehouseId, quantity: 1, orderId });

    await confirmReservationsByOrderId(orderId);

    const [reservation] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.orderId, orderId));
    expect(reservation?.status).toBe("CONFIRMED");

    const row = await readStock(productId, warehouseId);
    expect(row.quantityAvailable).toBe(4); // the sold unit does not come back
    expect(row.quantityReserved).toBe(0);
  });

  it("does nothing the second time the same event is delivered", async () => {
    const { productId, warehouseId } = await seedStock(5);
    const orderId = randomUUID();
    await reserveStock({ productId, warehouseId, quantity: 2, orderId });

    await confirmReservationsByOrderId(orderId);
    await confirmReservationsByOrderId(orderId);

    const row = await readStock(productId, warehouseId);
    expect(row.quantityAvailable).toBe(3);
    expect(row.quantityReserved).toBe(0);
  });

  it("only touches the paid order, not another order's reservation", async () => {
    const { productId, warehouseId } = await seedStock(5);
    const paidOrder = randomUUID();
    const otherOrder = randomUUID();
    await reserveStock({ productId, warehouseId, quantity: 1, orderId: paidOrder });
    await reserveStock({ productId, warehouseId, quantity: 1, orderId: otherOrder });

    await confirmReservationsByOrderId(paidOrder);

    const [other] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.orderId, otherOrder));
    expect(other?.status).toBe("PENDING");

    const row = await readStock(productId, warehouseId);
    expect(row.quantityAvailable).toBe(3);
    expect(row.quantityReserved).toBe(1); // only the other order's unit is still held
  });
});
