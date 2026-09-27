import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { assignDelivery, getWarehouseById } from "./deliveries.service.js";
import logger from "../../common/logger.js";

const handleAssignDelivery = async (payload: unknown) => {
  const { orderId, warehouseId } = payload as {
    orderId: string;
    warehouseId: string;
  };
  logger.info("handling AssignDelivery", { orderId, warehouseId });

  const warehouse = await getWarehouseById(warehouseId);
  const delivery = await assignDelivery(
    orderId,
    warehouseId,
    parseFloat(warehouse.latitude),
    parseFloat(warehouse.longitude),
  );
  logger.info("delivery assigned", {
    orderId,
    deliveryId: delivery.id,
    driverId: delivery.driverId,
  });

  await publish("DeliveryAssigned", {
    orderId,
    deliveryId: delivery.id,
    driverId: delivery.driverId,
    estimatedArrival: delivery.estimatedArrival,
  });
};

const registerDeliverySagaHandlers = async () => {
  await subscribe(
    "delivery.assign-delivery",
    "AssignDelivery",
    handleAssignDelivery,
  );
  logger.info("all event handlers registered");
};

export { registerDeliverySagaHandlers, handleAssignDelivery };
