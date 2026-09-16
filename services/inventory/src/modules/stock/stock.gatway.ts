import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import ApiError from "../../common/utils/api-error.js";
import {
  reserveStock,
  releaseReservation as releaseReservationById,
} from "./stock.service.js";

const registerInventorySagaHandlers = async () => {
  await subscribe(
    "inventory.order-created",
    "OrderCreated",
    async (payload) => {
      const { orderId, productId, warehouseId, quantity } = payload as {
        orderId: string;
        productId: string;
        warehouseId: string;
        quantity: number;
      };
      try {
        const reservation = await reserveStock({
          productId,
          warehouseId,
          quantity,
          orderId,
        });
        await publish("InventoryReserved", {
          orderId,
          reservationId: reservation.id,
          // Order needs an amount to hand to Payment. Inventory doesn't
          // own pricing — this is a placeholder until Catalog's price is
          // looked up (or passed through from the original request) once
          // Payment integration is wired up for real.
          amount: 0,
        });
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 409) {
          // Genuinely insufficient stock — not a bug, a real business outcome.
          await publish("InventoryReservationFailed", { orderId });
          return;
        }
        // Anything else (DB error, etc.) — rethrow so the subscriber's
        // retry-once-then-discard logic handles it, rather than silently
        // telling Order the reservation failed when it might just be transient.
        throw error;
      }
    },
  );
  // Payment failed downstream — undo the reservation this order made.
  await subscribe(
    "inventory.release-reservation",
    "ReleaseReservation",
    async (payload) => {
      const { reservationId } = payload as {
        orderId: string;
        reservationId: string;
      };
      await releaseReservationById(reservationId);
      // No outgoing event required here yet — Order already knows it's
      // compensating; this is Inventory completing its side of that.
    },
  );
  console.log("[inventory-saga] all event handlers registered");
};

export { registerInventorySagaHandlers };
