import { publish } from "../../common/events/publisher.js";
import { subscribe } from "../../common/events/subscriber.js";
import { updateOrderStatus } from "./orders.service.js";

const handleInventoryReserved = async (payload: unknown) => {
  const { orderId, reservationId } = payload as {
    orderId: string;
    reservationId: string;
  };
  const order = await updateOrderStatus(orderId, "STOCK_RESERVED", {
    reservationId,
  });
  await publish("ChargePayment", {
    orderId,
    amount: order.totalAmount,
    idempotencyKey: reservationId,
  });
};

const handleInventoryReservationFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  await updateOrderStatus(orderId, "STOCK_RESERVATION_FAILED");
};
const handlePaymentSucceeded = async (payload: unknown) => {
  const { orderId, paymentId } = payload as {
    orderId: string;
    paymentId: string;
  };

  const order = await updateOrderStatus(orderId, "CONFIRMED", { paymentId });

  if (order.warehouseId) {
    await publish("AssignDelivery", {
      orderId,
      warehouseId: order.warehouseId,
    });
  }
};
const handlePaymentFailed = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };

  const order = await updateOrderStatus(orderId, "PAYMENT_FAILED");

  if (order.reservationId) {
    await publish("ReleaseReservation", {
      orderId,
      reservationId: order.reservationId,
    });
  }
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
  console.log("[order-saga] all event handlers registered");
};

export {
  registerOrderSagaHandlers,
  handleInventoryReserved,
  handleInventoryReservationFailed,
  handlePaymentSucceeded,
  handlePaymentFailed,
};
