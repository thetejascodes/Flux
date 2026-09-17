import { db } from "../../common/db/index.js";
import { payments } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import type { ChargePaymentInput } from "./dto/payments.dto.js";

const simulateCharge = (amount: string): boolean => {
  return Math.random() > 0.1;
};

const chargePayment = async (input: ChargePaymentInput) => {
  const { orderId, amount } = input;
  const idempotencyKey = orderId;
  const succeeded = simulateCharge(amount);
  try {
    const [payment] = await db
      .insert(payments)
      .values({
        orderId,
        amount,
        status: succeeded ? "SUCCEEDED" : "FAILED",
        idempotencyKey,
      })
      .returning();

    if (!payment) {
      throw ApiError.internal("Failed to record payment");
    }
    return payment;
  } catch (error: any) {
    if (error.code === "23505") {
      const [existing] = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey));
      if (existing) {
        return existing;
      }
      throw error;
    }
  }
};

const getPaymentByOrderId = async (orderId: string) => {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId));
  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }
  return payment;
};
