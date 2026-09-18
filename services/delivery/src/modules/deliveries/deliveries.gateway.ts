import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { assignDelivery, getWarehouseById } from "./deliveries.service.js";

const registerDeliverySagaHandlers = async () => {
  await subscribe(
    "delivery.assign-delivery",
    "AssignDelivery",
    async (payload) => {
      const { orderId, warehouseId } = payload as {
        orderId: string;
        warehouseId: string;
      };
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
    },
  );
  console.log("[delivery-saga] all event handlers registered");
};

export { registerDeliverySagaHandlers };
