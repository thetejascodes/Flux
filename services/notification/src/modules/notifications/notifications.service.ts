import twilio from "twilio";
import { db } from "../../common/db/index.js";
import { notifications } from "./notifications.schema.js";
import config from "../../common/config/index.js";

type NotificationType =
  | "ORDER_CREATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "DELIVERY_ASSIGNED";

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

const notify = async (
  orderId: string,
  type: NotificationType,
  message: string,
  phone: string | null = null,
): Promise<void> => {
  try {
    await db.insert(notifications).values({ orderId, type, message });
    send(phone,message);
  } catch (error: any) {
    if (error.code === "23505") {
      console.log(
        `[notification] skipped duplicate ${type} for order ${orderId}`,
      );
      return;
    }
    throw error;
  }
};

export { notify };
export type { NotificationType };
