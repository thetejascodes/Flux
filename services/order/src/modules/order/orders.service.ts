import { db } from "../../common/db/index.js";
import { orders, orderStatus, orderItems } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import { publish } from "../../common/events/publisher.js";
import type { PlaceOrderInput } from "./dto/orders.dto.js";
import config from "../../common/config/index.js";

interface CatalogProductResponse {
  status: string;
  message: string;
  data: {
    id: string;
    price: string;
  };
}

const getProductPrice = async (productId: string): Promise<number> => {
  let response: Response;
  try {
    response = await fetch(
      `${config.services.catalogUrl}/products/${productId}`,
    );
  } catch {
    throw ApiError.internal("Catalog service is unreachable");
  }

  if (!response.ok) {
    throw ApiError.badRequest("Product not found in catalog");
  }

  const body = (await response.json()) as CatalogProductResponse;
  return parseFloat(body.data.price);
};

const placeOrder = async (userId: string, input: PlaceOrderInput) => {
  const { warehouseId, items } = input;

  const itemsWithPrice = await Promise.all(
    items.map(async (item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: await getProductPrice(item.productId),
    })),
  );

  const subtotal = itemsWithPrice.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  const shippingFee =
    subtotal >= config.shipping.freeThreshold ? 0 : config.shipping.flatFee;

  const totalAmount = subtotal + shippingFee;

  const order = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        warehouseId,
        subtotal: subtotal.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: "PENDING",
      })
      .returning();

    if (!order) {
      throw ApiError.internal("Failed to create order");
    }

    await tx.insert(orderItems).values(
      itemsWithPrice.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );

    return order;
  });

  await publish("OrderCreated", {
    orderId: order.id,
    userId,
    warehouseId,
    items: itemsWithPrice.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
    })),
    subtotal: subtotal.toFixed(2),
    shippingFee: shippingFee.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  });

  return order;
};

const getOrderById = async (id: string) => {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
};

const updateOrderStatus = async (
  orderId: string,
  status: (typeof orderStatus.enumValues)[number],
  extra: Partial<{ paymentId: string }> = {},
) => {
  const [order] = await db
    .update(orders)
    .set({ status, ...extra })
    .where(eq(orders.id, orderId))
    .returning();
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
};

export { placeOrder, getOrderById, updateOrderStatus, getProductPrice };
