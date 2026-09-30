import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import ApiError from "../../common/utils/api-error.js";
import {
  reserveStock,
  releaseReservation as releaseReservationById,
  releaseReservationsByOrderId,
} from "./stock.service.js";
import logger from "../../common/logger.js";

interface OrderItem {
  productId: string;
  quantity: number;
}

const handleOrderCreated = async (payload: unknown) => {
  const { orderId, warehouseId, items } = payload as {
    orderId: string;
    warehouseId: string;
    items: OrderItem[];
  };
  logger.info("handling OrderCreated", {
    orderId,
    warehouseId,
    itemCount: items.length,
  });

  const succeededReservationIds: string[] = [];

  for (const item of items) {
    try {
      const reservation = await reserveStock({
        productId: item.productId,
        warehouseId,
        quantity: item.quantity,
        orderId,
      });
      succeededReservationIds.push(reservation.id);
      logger.info("item reserved", {
        orderId,
        productId: item.productId,
        reservationId: reservation.id,
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        logger.warn("insufficient stock for item, compensating", {
          orderId,
          productId: item.productId,
        });

        for (const reservationId of succeededReservationIds) {
          try {
            await releaseReservationById(reservationId);
          } catch (releaseError) {
            logger.error("failed to release reservation during compensation", {
              orderId,
              reservationId,
              error:
                releaseError instanceof Error
                  ? releaseError.message
                  : String(releaseError),
            });
          }
        }

        await publish("InventoryReservationFailed", { orderId });
        return;
      }

      logger.error("unexpected error reserving stock", {
        orderId,
        productId: item.productId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  logger.info("all items reserved", { orderId });
  await publish("InventoryReserved", { orderId });
};

const handleReleaseReservation = async (payload: unknown) => {
  const { orderId } = payload as { orderId: string };
  logger.info("releasing all reservations for order", { orderId });

  await releaseReservationsByOrderId(orderId);
};

const registerInventorySagaHandlers = async () => {
  await subscribe(
    "inventory.order-created",
    "OrderCreated",
    handleOrderCreated,
  );
  await subscribe(
    "inventory.release-reservation",
    "ReleaseReservation",
    handleReleaseReservation,
  );
  logger.info("all event handlers registered");
};

export {
  registerInventorySagaHandlers,
  handleOrderCreated,
  handleReleaseReservation,
};
