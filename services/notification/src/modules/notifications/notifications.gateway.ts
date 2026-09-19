import { subscribe } from "../../common/events/subscriber.js";
import { notify } from "./notifications.service.js";

const registerNotificationSagaHandlers = async () => {
  await subscribe(
    "notification.order-created",
    "OrderCreated",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await notify(
        orderId,
        "ORDER_CREATED",
        `Your order ${orderId} has been placed.`,
      );
    },
  );
  await subscribe(
    "notification.payment-succeeded",
    "PaymentSucceeded",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await notify(
        orderId,
        "PAYMENT_SUCCEEDED",
        `Payment confirmed for order ${orderId}.`,
      );
    },
  );

  await subscribe(
    "notification.payment-failed",
    "PaymentFailed",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await notify(
        orderId,
        "PAYMENT_FAILED",
        `Payment failed for order ${orderId}. Please try again.`,
      );
    },
  );

  await subscribe(
    "notification.delivery-assigned",
    "DeliveryAssigned",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await notify(
        orderId,
        "DELIVERY_ASSIGNED",
        `A driver has been assigned to order ${orderId}. It's on its way.`,
      );
    },
  );
  console.log("[notification-saga] all event handlers registered");
};
