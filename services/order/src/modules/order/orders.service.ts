import { db } from "../../common/db/index.js";
import { orders, orderStatus } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import { publish } from "../../common/events/publisher.js";
import type { PlaceOrderInput } from "./dto/orders.dto.js";

const placeOrder = async (userId: string, input: PlaceOrderInput) => {
  const { productId, warehouseId, quantity } = input;
  const [order] = await db
    .insert(orders)
    .values({
      userId,
      productId,
      warehouseId,
      quantity,
      status: "PENDING",
    })
    .returning();
  if (!order) {
    throw ApiError.internal("Failed to create order");
  }

  await publish("OrderCreated", {
    orderId: order.id,
    productId,
    warehouseId,
    quantity,
  });
  return order;
};
