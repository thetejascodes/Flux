import { publish } from "../../common/events/publisher.js";
import { subscribe } from "../../common/events/subscriber.js";
import { updateOrderStatus } from "./orders.service.js";
import logger from "../../common/logger.js";

const handleInventoryReserved = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("handling InventoryReserved", { orderId });

  const order = await updateOrderStatus(orderId, "STOCK_RESERVED");
  logger.info("order updated to STOCK_RESERVED, charging payment", {
    orderId,
    amount: order.totalAmount,
  });

  await publish("ChargePayment", {
    orderId,
    amount: order.totalAmount,
    idempotencyKey: orderId,
  });
};

const handleInventoryReservationFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.warn("handling InventoryReservationFailed", { orderId });

  await updateOrderStatus(orderId, "STOCK_RESERVATION_FAILED");
};

const handlePaymentSucceeded = async (payload: unknown) => {
  const { orderId, paymentId } = payload as {
    orderId: string;
    paymentId: string;
  };
  logger.info("handling PaymentSucceeded", { orderId, paymentId });

  const order = await updateOrderStatus(orderId, "CONFIRMED", { paymentId });

  if (order.warehouseId) {
    logger.info("order confirmed, assigning delivery", {
      orderId,
      warehouseId: order.warehouseId,
    });

    await publish("AssignDelivery", {
      orderId,
      warehouseId: order.warehouseId,
    });
  }
};

const handlePaymentFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.warn("handling PaymentFailed", { orderId });

  await updateOrderStatus(orderId, "PAYMENT_FAILED");

  logger.info("releasing reservations after payment failure", { orderId });

  await publish("ReleaseReservation", { orderId });
};

const registerOrderSagaHandlers = async () => {
  await subscribe(
    "order.inventory-reserved",
    "InventoryReserved",
    handleInventoryReserved,
  );
  await subscribe(
    "order.inventory-reservation-failed",
    "InventoryReservationFailed",
    handleInventoryReservationFailed,
  );
  await subscribe(
    "order.payment-succeeded",
    "PaymentSucceeded",
    handlePaymentSucceeded,
  );
  await subscribe("order.payment-failed", "PaymentFailed", handlePaymentFailed);
  logger.info("all event handlers registered");
};

export {
  registerOrderSagaHandlers,
  handleInventoryReserved,
  handleInventoryReservationFailed,
  handlePaymentSucceeded,
  handlePaymentFailed,
};
