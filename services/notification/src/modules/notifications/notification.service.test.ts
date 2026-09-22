import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { notifications } from "../../common/db/schema.js";
import { notify } from "./notifications.service.js";
import {
  handleOrderCreated,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleDeliveryAssigned,
} from "./notifications.gateway.js";
import { eq } from "drizzle-orm";

describe("notify idempotency", () => {
  it("only creates one row even when called twice for the same order+type", async () => {
    const orderId = randomUUID();
    await notify(orderId, "ORDER_CREATED", "Your order has been placed.");
    await notify(orderId, "ORDER_CREATED", "Your order has been placed.");

    const rows = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(rows.length).toBe(1);
  });

  it("allows different notification types for the same order", async () => {
    const orderId = randomUUID();
    await notify(orderId, "ORDER_CREATED", "Your order has been placed.");
    await notify(orderId, "PAYMENT_SUCCEEDED", "Payment confirmed.");

    const rows = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(rows.length).toBe(2);
  });
});

describe("saga handlers (real gateway functions)", () => {
  it("handleOrderCreated stores the correct type and message", async () => {
    const orderId = randomUUID();
    await handleOrderCreated({ orderId });

    const [row] = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(row?.type).toBe("ORDER_CREATED");
    expect(row?.message).toContain(orderId);
    expect(row?.message.toLowerCase()).toContain("placed");
  });

  it("handlePaymentSucceeded stores PAYMENT_SUCCEEDED, not a generic type", async () => {
    const orderId = randomUUID();
    await handlePaymentSucceeded({ orderId });

    const [row] = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(row?.type).toBe("PAYMENT_SUCCEEDED");
    expect(row?.message.toLowerCase()).toContain("confirmed");
  });

  it("handlePaymentFailed stores PAYMENT_FAILED with a retry hint", async () => {
    const orderId = randomUUID();
    await handlePaymentFailed({ orderId });

    const [row] = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(row?.type).toBe("PAYMENT_FAILED");
    expect(row?.message.toLowerCase()).toContain("failed");
  });

  it("handleDeliveryAssigned stores DELIVERY_ASSIGNED", async () => {
    const orderId = randomUUID();
    await handleDeliveryAssigned({ orderId });

    const [row] = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(row?.type).toBe("DELIVERY_ASSIGNED");
  });

  it("a redelivered PaymentSucceeded event does not create a second row", async () => {
    const orderId = randomUUID();
    await handlePaymentSucceeded({ orderId });
    await handlePaymentSucceeded({ orderId });

    const rows = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    expect(rows.length).toBe(1);
  });
});