import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import ApiError from "../../common/utils/api-error.js";
import {
  reserveStock,
  releaseReservation as releaseReservationById,
} from "./stock.service.js";
import logger from "../../common/logger.js";

const handleOrderCreated = async (payload: unknown) => {
  const { orderId, productId, warehouseId, quantity } = payload as {
    orderId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
  };
  logger.info("handling OrderCreated", {
    orderId,
    productId,
    warehouseId,
    quantity,
  });

  try {
    const reservation = await reserveStock({
      productId,
      warehouseId,
      quantity,
      orderId,
    });
    logger.info("stock reserved", { orderId, reservationId: reservation.id });
    await publish("InventoryReserved", {
      orderId,
      reservationId: reservation.id,
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) {
      logger.warn("insufficient stock, reservation failed", {
        orderId,
        productId,
        warehouseId,
      });

      await publish("InventoryReservationFailed", { orderId });
      return;
    }
    logger.error("unexpected error reserving stock", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const handleReleaseReservation = async (payload: unknown) => {
  const { reservationId } = payload as {
    orderId: string;
    reservationId: string;
  };
  logger.info("releasing reservation", { reservationId });

  await releaseReservationById(reservationId);
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
