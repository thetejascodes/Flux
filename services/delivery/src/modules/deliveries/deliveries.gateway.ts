import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { assignDelivery, getWarehouseById } from "./deliveries.service.js";

const handleAssignDelivery = async (payload: unknown) => {
  const { orderId, warehouseId } = payload as { orderId: string; warehouseId: string };
  const warehouse = await getWarehouseById(warehouseId);
  const delivery = await assignDelivery(
    orderId,
    warehouseId,
    parseFloat(warehouse.latitude),
    parseFloat(warehouse.longitude),
  );
  await publish("DeliveryAssigned", {
    orderId,
    deliveryId: delivery.id,
    driverId: delivery.driverId,
    estimatedArrival: delivery.estimatedArrival,
  });
};

const registerDeliverySagaHandlers = async () => {
  await subscribe("delivery.assign-delivery", "AssignDelivery", handleAssignDelivery);
  console.log("[delivery-saga] all event handlers registered");
};

export { registerDeliverySagaHandlers, handleAssignDelivery };