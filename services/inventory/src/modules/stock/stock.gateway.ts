import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import ApiError from "../../common/utils/api-error.js";
import {
  reserveStock,
  releaseReservation as releaseReservationById,
} from "./stock.service.js";

const handleOrderCreated = async (payload: unknown) => {
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
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) {
      await publish("InventoryReservationFailed", { orderId });
      return;
    }
    throw error;
  }
};

const handleReleaseReservation = async (payload: unknown) => {
  const { reservationId } = payload as {
    orderId: string;
    reservationId: string;
  };
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
  console.log("[inventory-saga] all event handlers registered");
};

export {
  registerInventorySagaHandlers,
  handleOrderCreated,
  handleReleaseReservation,
};
