import twilio from "twilio";
import { db } from "../../common/db/index.js";
import { notifications } from "./notifications.schema.js";
import config from "../../common/config/index.js";

type NotificationType =
  | "ORDER_CREATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "DELIVERY_ASSIGNED"
  | "CART_ABANDONED";

const client = config.notificationStubMode
  ? null
  : twilio(config.twilio.apiKeySid, config.twilio.apiKeySecret, {
      accountSid: config.twilio.accountSid,
    });

const send = async (phone: string | null, message: string): Promise<void> => {
  if (config.notificationStubMode || !client || !phone) {
    console.log(`[notification][DEV] to ${phone ?? "unknown"}: ${message}`);
    return;
  }
  await client.messages.create({
    body: message,
    from: config.twilio.fromNumber,
    to: phone,
  });
};

const isUniqueViolation = (error: any): boolean =>
  (error.code ?? error.cause?.code) === "23505";

const notify = async (
  orderId: string,
  type: NotificationType,
  message: string,
  phone: string | null = null,
): Promise<void> => {
  try {
    await db.insert(notifications).values({ orderId, type, message });
    await send(phone, message);
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      console.log(
        `[notification] skipped duplicate ${type} for order ${orderId}`,
      );
      return;
    }
    throw error;
  }
};

const notifyCartAbandoned = async (
  userId: string,
  lastActivity: string,
  message: string,
  phone: string | null = null,
): Promise<void> => {
  const dedupKey = `CART_ABANDONED:${userId}:${lastActivity}`;
  try {
    await db.insert(notifications).values({
      userId,
      type: "CART_ABANDONED",
      message,
      dedupKey,
    });
    await send(phone, message);
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      console.log(
        `[notification] skipped duplicate CART_ABANDONED for user ${userId}`,
      );
      return;
    }
    throw error;
  }
};

export { notify, notifyCartAbandoned };
export type { NotificationType };
