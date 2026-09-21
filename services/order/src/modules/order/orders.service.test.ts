import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { orders } from "../../common/db/schema.js";
import { updateOrderStatus, placeOrder } from "./orders.service.js";
import { handleInventoryReserved } from "./orders.gateway.js";

vi.mock("../../common/events/publisher.js", () => ({
  publish: vi.fn(),
}));

import { publish } from "../../common/events/publisher.js";

const seedOrder = async (overrides: Partial<typeof orders.$inferInsert> = {}) => {
  const [order] = await db
    .insert(orders)
    .values({
      id: randomUUID(),
      userId: randomUUID(),
      productId: randomUUID(),
      warehouseId: randomUUID(),
      quantity: 1,
      totalAmount: "12.00",
      status: "PENDING",
      ...overrides,
    })
    .returning();
  return order!;
};

describe("updateOrderStatus", () => {
  it("moves an order to STOCK_RESERVED and stores the reservationId", async () => {
    const order = await seedOrder();
    const reservationId = randomUUID();
    const updated = await updateOrderStatus(order.id, "STOCK_RESERVED", { reservationId });
    expect(updated.status).toBe("STOCK_RESERVED");
    expect(updated.reservationId).toBe(reservationId);
  });

  it("moves an order to CONFIRMED and stores the paymentId", async () => {
    const order = await seedOrder();
    const paymentId = randomUUID();
    const updated = await updateOrderStatus(order.id, "CONFIRMED", { paymentId });
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.paymentId).toBe(paymentId);
  });

  it("moves an order to PAYMENT_FAILED without requiring extra fields", async () => {
    const order = await seedOrder();
    const updated = await updateOrderStatus(order.id, "PAYMENT_FAILED");
    expect(updated.status).toBe("PAYMENT_FAILED");
  });

  it("throws a clean not-found error for a nonexistent order", async () => {
    await expect(updateOrderStatus(randomUUID(), "CONFIRMED")).rejects.toThrow(/not found/i);
  });
});

describe("placeOrder pricing", () => {
  it("calculates totalAmount to exactly 2 decimal places, not rounded to a whole number", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", message: "", data: { id: "x", price: "49.99" } }),
    }) as any;

    const order = await placeOrder(randomUUID(), {
      productId: randomUUID(),
      warehouseId: randomUUID(),
      quantity: 2,
    });

    expect(order.totalAmount).toBe("99.98");
  });

  it("throws a clean error when Catalog is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

    await expect(
      placeOrder(randomUUID(), {
        productId: randomUUID(),
        warehouseId: randomUUID(),
        quantity: 1,
      }),
    ).rejects.toThrow(/unreachable/i);
  });
});

describe("handleInventoryReserved (real saga handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the order to STOCK_RESERVED and publishes ChargePayment with reservationId as the idempotencyKey", async () => {
    const order = await seedOrder({ totalAmount: "48.00" });
    const reservationId = randomUUID();

    await handleInventoryReserved({ orderId: order.id, reservationId });

    expect(publish).toHaveBeenCalledWith("ChargePayment", {
      orderId: order.id,
      amount: "48.00",
      idempotencyKey: reservationId,
    });
  });

  it("uses a different idempotencyKey for a different reservationId on the same order", async () => {
    const order = await seedOrder({ totalAmount: "48.00" });
    const firstReservation = randomUUID();
    const secondReservation = randomUUID();

    await handleInventoryReserved({ orderId: order.id, reservationId: firstReservation });
    await handleInventoryReserved({ orderId: order.id, reservationId: secondReservation });

    expect(publish).toHaveBeenNthCalledWith(
      1,
      "ChargePayment",
      expect.objectContaining({ idempotencyKey: firstReservation }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      "ChargePayment",
      expect.objectContaining({ idempotencyKey: secondReservation }),
    );
  });
});