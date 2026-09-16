import { subscribe } from "../../common/events/subscriber.js";
import { updateOrderStatus } from "./orders.service.js";

/**
 * Order's side of the saga. Reacts to events Inventory (and later
 * Payment) publish. One handler = one state transition, same discipline
 * as Inventory's gateway.
 */

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
      await updateOrderStatus(orderId, "STOCK_RESERVED", { reservationId });
      // Next step of the saga (Phase 2, once Payment exists): publish
      // something Payment listens for, e.g. publish("ChargePayment", {...}).
    },
  );
  // Inventory could not reserve stock — genuinely out of stock.
  await subscribe(
    "order.inventory-reservation-failed",
    "InventoryReservationFailed",
    async (payload) => {
      const { orderId } = payload as { orderId: string };
      await updateOrderStatus(orderId, "STOCK_RESERVATION_FAILED");
    },
  );
  console.log("[order-saga] all event handlers registered");
};

export { registerOrderSagaHandlers };
