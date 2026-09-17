import { publish } from "../../common/events/publisher.js";
import { subscribe } from "../../common/events/subscriber.js";
import { updateOrderStatus } from "./orders.service.js";

const registerOrderSagaHandlers = async () => {
  await subscribe(
    "order.inventory-reserved",
    "InventoryReserved",
    async (payload) => {
      const { orderId, reservationId } = payload as {
        orderId: string;
        reservationId: string;
        amount: number;
      };
      const order = await updateOrderStatus(orderId, "STOCK_RESERVED", { reservationId });
      await publish("ChargePayment", {
        orderId,
        amount:order.totalAmount,
      });
    },
  );
  await subscribe(
    "order.inventory-reservation-failed",
    "InventoryReservationFailed",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await updateOrderStatus(orderId, "STOCK_RESERVATION_FAILED");
    },
  );
  await subscribe(
    "order.payment-succeeded",
    "PaymentSucceeded",
    async (payload) => {
      const { orderId, paymentId } = payload as {
        orderId: string;
        paymentId: string;
      };
      await updateOrderStatus(orderId, "CONFIRMED", { paymentId });
    },
  );
  await subscribe("order.payment-failed", "PaymentFailed", async (payload) => {
    const { orderId, paymentId } = payload as {
      orderId: string;
      paymentId: string;
    };
    const order = await updateOrderStatus(orderId, "PAYMENT_FAILED");
    if (order.reservationId) {
      await publish("ReleaseReservation", {
        orderId,
        reservationId: order.reservationId,
      });
    }
  });
  console.log("[order-saga] all event handlers registered");
};

export { registerOrderSagaHandlers };
