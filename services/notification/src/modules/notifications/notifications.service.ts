import { db } from "../../common/db/index.js";
import { notifications } from "./notifications.schema.js";

type NotificationType =
  | "ORDER_CREATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "DELIVERY_ASSIGNED";

const send = (message: string): void => {
  console.log(`[notification] ${message}`);
};

const notify = async (
  orderId: string,
  type: NotificationType,
  message: string,
): Promise<void> => {
  try {
    await db.insert(notifications).values({ orderId, type, message });
    send(message);
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
