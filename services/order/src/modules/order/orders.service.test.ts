import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { orders, orderItems } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import { updateOrderStatus, placeOrder } from "./orders.service.js";
import { handleInventoryReserved } from "./orders.gateway.js";

vi.mock("../../common/events/publisher.js", () => ({
  publish: vi.fn(),
}));

import { publish } from "../../common/events/publisher.js";

const seedOrder = async (
  overrides: Partial<typeof orders.$inferInsert> = {},
) => {
  const [order] = await db
    .insert(orders)
    .values({
      id: randomUUID(),
      userId: randomUUID(),
      warehouseId: randomUUID(),
      subtotal: "12.00",
      shippingFee: "0.00",
      totalAmount: "12.00",
      status: "PENDING",
      ...overrides,
    })
    .returning();
  return order!;
};

describe("updateOrderStatus", () => {
  it("moves an order to CONFIRMED and stores the paymentId", async () => {
    const order = await seedOrder();
    const paymentId = randomUUID();
    const updated = await updateOrderStatus(order.id, "CONFIRMED", {
      paymentId,
    });
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.paymentId).toBe(paymentId);
  });

  it("moves an order to STOCK_RESERVED without requiring extra fields", async () => {
    const order = await seedOrder();
    const updated = await updateOrderStatus(order.id, "STOCK_RESERVED");
    expect(updated.status).toBe("STOCK_RESERVED");
  });

  it("moves an order to PAYMENT_FAILED without requiring extra fields", async () => {
    const order = await seedOrder();
    const updated = await updateOrderStatus(order.id, "PAYMENT_FAILED");
    expect(updated.status).toBe("PAYMENT_FAILED");
  });

  it("throws a clean not-found error for a nonexistent order", async () => {
    await expect(
      updateOrderStatus(randomUUID(), "CONFIRMED"),
    ).rejects.toThrow(/not found/i);
  });
});

describe("placeOrder pricing", () => {
  it("calculates totalAmount to exactly 2 decimal places for a single item, not rounded to a whole number", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        message: "",
        data: { id: "x", price: "49.99" },
      }),
    }) as any;

    const order = await placeOrder(randomUUID(), {
      warehouseId: randomUUID(),
      items: [{ productId: randomUUID(), quantity: 2 }],
    });

    expect(order.subtotal).toBe("99.98");
    expect(order.totalAmount).toBe(
      (99.98 + Number(order.shippingFee)).toFixed(2),
    );
  });

  it("sums subtotal correctly across multiple different-priced items and creates one order_items row per item", async () => {
    const priceByProduct: Record<string, string> = {};
    const productA = randomUUID();
    const productB = randomUUID();
    priceByProduct[productA] = "10.00";
    priceByProduct[productB] = "25.50";

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const productId = url.split("/").pop()!;
      return {
        ok: true,
        json: async () => ({
          status: "success",
          message: "",
          data: { id: productId, price: priceByProduct[productId] },
        }),
      };
    }) as any;

    const order = await placeOrder(randomUUID(), {
      warehouseId: randomUUID(),
      items: [
        { productId: productA, quantity: 2 }, // 20.00
        { productId: productB, quantity: 1 }, // 25.50
      ],
    });

    expect(order.subtotal).toBe("45.50");

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    expect(items).toHaveLength(2);
    expect(items.find((i) => i.productId === productA)?.unitPrice).toBe(
      "10.00",
    );
    expect(items.find((i) => i.productId === productB)?.unitPrice).toBe(
      "25.50",
    );
  });

  it("throws a clean error when Catalog is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

    await expect(
      placeOrder(randomUUID(), {
        warehouseId: randomUUID(),
        items: [{ productId: randomUUID(), quantity: 1 }],
      }),
    ).rejects.toThrow(/unreachable/i);
  });
});

describe("handleInventoryReserved (real saga handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the order to STOCK_RESERVED and publishes ChargePayment with orderId as the idempotencyKey", async () => {
    const order = await seedOrder({ totalAmount: "48.00" });

    await handleInventoryReserved({ orderId: order.id });

    expect(publish).toHaveBeenCalledWith("ChargePayment", {
      orderId: order.id,
      amount: "48.00",
      idempotencyKey: order.id,
    });
  });

  it("uses the same stable idempotencyKey across repeated deliveries of the same order", async () => {
    const order = await seedOrder({ totalAmount: "48.00" });

    await handleInventoryReserved({ orderId: order.id });
    await handleInventoryReserved({ orderId: order.id });

    expect(publish).toHaveBeenNthCalledWith(
      1,
      "ChargePayment",
      expect.objectContaining({ idempotencyKey: order.id }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      "ChargePayment",
      expect.objectContaining({ idempotencyKey: order.id }),
    );
  });
});