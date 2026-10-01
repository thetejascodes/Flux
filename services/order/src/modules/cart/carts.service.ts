import { cartItems } from "../../common/db/schema.js";
import { db } from "../../common/db/index.js";
import ApiError from "../../common/utils/api-error.js";
import type { AddCartItemInput } from "./dto/cart.dto.js";
import { sql } from "drizzle-orm";

const addToCart = async (userId: string, input: AddCartItemInput) => {
  const { productId, quantity } = input;

  const [cartItem] = await db
    .insert(cartItems)
    .values({
      userId,
      productId,
      quantity,
    })
    .onConflictDoUpdate({
      target: [cartItems.userId, cartItems.productId],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    })
    .returning();
  if (!cartItem) {
    throw ApiError.internal("Failed to add item to cart");
  }
  return cartItem;
};

const updateCartItemQuantity = async () => {};
const removeFromCart = async () => {};
const getCart = async () => {};
