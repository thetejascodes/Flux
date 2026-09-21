import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { payments } from "../../common/db/schema.js";
import { chargePayment } from "./payments.service.js";
import { eq } from "drizzle-orm";

describe("chargePayment idempotency", () => {
  const orderId = randomUUID();
  const idempotencyKey = randomUUID();

  beforeEach(async () => {
    await db.delete(payments).where(eq(payments.orderId, orderId));
  });

  it("only creates one payment row even when called twice with the same idempotency key", async () => {
    const result1 = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey,
    });
    const result2 = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey,
    });

    expect(result1?.id).toBe(result2?.id);
    expect(result1?.status).toBe(result2?.status);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId));
    expect(rows.length).toBe(1);
  });

  it("returns the same outcome on redelivery of the same idempotency key, not a fresh random roll", async () => {
    const first = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey,
    });
    const second = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey,
    });
    expect(second?.status).toBe(first?.status);
  });

  it("allows a second charge attempt for the same order with a different idempotency key", async () => {
    const first = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey,
    });
    const retryKey = randomUUID();
    const second = await chargePayment({
      orderId,
      amount: "24.00",
      idempotencyKey: retryKey,
    });

    // different keys → genuinely separate charge attempts, not deduplicated
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId));
    expect(rows.length).toBe(2);
  });
});
