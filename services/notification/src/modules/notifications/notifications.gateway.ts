import { subscribe } from "../../common/events/subscriber.js";
import { notify, notifyCartAbandoned } from "./notifications.service.js";
import logger from "../../common/logger.js";

const handleOrderCreated = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("handling OrderCreated", { orderId });

  await notify(
    orderId,
    "ORDER_CREATED",
    `Your order ${orderId} has been placed.`,
  );
};

const handlePaymentSucceeded = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("handling PaymentSucceeded", { orderId });

  await notify(
    orderId,
    "PAYMENT_SUCCEEDED",
    `Payment confirmed for order ${orderId}.`,
  );
};

const handlePaymentFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("handling PaymentFailed", { orderId });

  await notify(
    orderId,
    "PAYMENT_FAILED",
    `Payment failed for order ${orderId}. Please try again.`,
  );
};

const handleDeliveryAssigned = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("handling DeliveryAssigned", { orderId });

  await notify(
    orderId,
    "DELIVERY_ASSIGNED",
    `A driver has been assigned to order ${orderId}. It's on its way.`,
  );
};

const handleCartAbandoned = async (payload: unknown) => {
  const { userId, lastActivity, items } = payload as {
    userId: string;
    lastActivity: string;
    items: { productId: string; quantity: number }[];
  };
  logger.info("handling CartAbandoned", { userId });

  // A malformed event throws so it ends up in the dead-letter queue
  // instead of being silently dropped.
  if (!userId || !lastActivity) {
    throw new Error("CartAbandoned event missing userId or lastActivity");
  }

  const itemCount = (items ?? []).reduce((sum, i) => sum + i.quantity, 0);

  await notifyCartAbandoned(
    userId,
    lastActivity,
    `You left ${itemCount} item(s) in your cart. Come back and complete your order.`,
  );
};

const registerNotificationSagaHandlers = async () => {
  await subscribe(
    "notification.order-created",
    "OrderCreated",
    handleOrderCreated,
  );
  await subscribe(
    "notification.payment-succeeded",
    "PaymentSucceeded",
    handlePaymentSucceeded,
  );
  await subscribe(
    "notification.payment-failed",
    "PaymentFailed",
    handlePaymentFailed,
  );
  await subscribe(
    "notification.delivery-assigned",
    "DeliveryAssigned",
    handleDeliveryAssigned,
  );
  await subscribe(
    "notification.cart-abandoned",
    "CartAbandoned",
    handleCartAbandoned,
  );
  logger.info("all event handlers registered");
};

export {
  registerNotificationSagaHandlers,
  handleOrderCreated,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleDeliveryAssigned,
  handleCartAbandoned,
};
