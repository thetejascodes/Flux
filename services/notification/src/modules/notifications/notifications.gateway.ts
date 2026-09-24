import { subscribe } from "../../common/events/subscriber.js";
import ApiError from "../../common/utils/api-errors.js";
import { notify } from "./notifications.service.js";

const handleOrderCreated = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  await notify(
    orderId,
    "ORDER_CREATED",
    `Your order ${orderId} has been placed.`,
  );
};

const handlePaymentSucceeded = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  throw ApiError.internal("forced failure for DLQ test");
  await notify(
    orderId,
    "PAYMENT_SUCCEEDED",
    `Payment confirmed for order ${orderId}.`,
  );
};

const handlePaymentFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  await notify(
    orderId,
    "PAYMENT_FAILED",
    `Payment failed for order ${orderId}. Please try again.`,
  );
};

const handleDeliveryAssigned = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  await notify(
    orderId,
    "DELIVERY_ASSIGNED",
    `A driver has been assigned to order ${orderId}. It's on its way.`,
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
  console.log("[notification-saga] all event handlers registered");
};

export {
  registerNotificationSagaHandlers,
  handleOrderCreated,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleDeliveryAssigned,
};
