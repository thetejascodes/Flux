import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { cartItems } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import {
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  getCart,
} from "./carts.service.js";

const USER_A = randomUUID();
const USER_B = randomUUID();
const PRODUCT_A = randomUUID();
const PRODUCT_B = randomUUID();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("cart.service", () => {
  beforeEach(async () => {
    // start each test with a clean slate for both users
    await db.delete(cartItems).where(eq(cartItems.userId, USER_A));
    await db.delete(cartItems).where(eq(cartItems.userId, USER_B));
  });

  describe("addToCart", () => {
    it("bumps updatedAt when the same product is added again", async () => {
      const first = await addToCart(USER_A, {
        productId: PRODUCT_A,
        quantity: 1,
      });

      await wait(50);

      const second = await addToCart(USER_A, {
        productId: PRODUCT_A,
        quantity: 1,
      });

      expect(second.updatedAt.getTime()).toBeGreaterThan(
        first.updatedAt.getTime(),
      );
    });

    it("increments the existing quantity instead of creating a duplicate row", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 2 });
      const updated = await addToCart(USER_A, {
        productId: PRODUCT_A,
        quantity: 3,
      });

      expect(updated.quantity).toBe(5);

      const rows = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.userId, USER_A));

      expect(rows).toHaveLength(1);
    });
  });

  describe("updateCartItemQuantity", () => {
    it("sets the quantity to an exact value, not additive", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 5 });

      const updated = await updateCartItemQuantity(USER_A, PRODUCT_A, {
        quantity: 10,
      });

      expect(updated.quantity).toBe(10);
    });

    it("bumps updatedAt when the quantity is updated", async () => {
      const first = await addToCart(USER_A, {
        productId: PRODUCT_A,
        quantity: 1,
      });

      await wait(50);

      const updated = await updateCartItemQuantity(USER_A, PRODUCT_A, {
        quantity: 4,
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        first.updatedAt.getTime(),
      );
    });

    it("throws not found when the product isn't in that user's cart", async () => {
      await expect(
        updateCartItemQuantity(USER_A, PRODUCT_A, { quantity: 1 }),
      ).rejects.toThrow(/not found/i);
    });

    it("does not let one user update another user's cart item", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 5 });

      await expect(
        updateCartItemQuantity(USER_B, PRODUCT_A, { quantity: 1 }),
      ).rejects.toThrow(/not found/i);

      // confirm user A's item was untouched
      const [stillFive] = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.userId, USER_A));
      expect(stillFive!.quantity).toBe(5);
    });
  });

  describe("removeFromCart", () => {
    it("deletes the matching cart item", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 1 });

      await removeFromCart(USER_A, PRODUCT_A);

      const rows = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.userId, USER_A));
      expect(rows).toHaveLength(0);
    });

    it("throws not found when nothing matches", async () => {
      await expect(removeFromCart(USER_A, PRODUCT_A)).rejects.toThrow(
        /not found/i,
      );
    });

    it("does not let one user remove another user's cart item", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 1 });

      await expect(removeFromCart(USER_B, PRODUCT_A)).rejects.toThrow(
        /not found/i,
      );

      const rows = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.userId, USER_A));
      expect(rows).toHaveLength(1);
    });
  });

  describe("getCart", () => {
    it("returns all items belonging to a user", async () => {
      await addToCart(USER_A, { productId: PRODUCT_A, quantity: 1 });
      await addToCart(USER_A, { productId: PRODUCT_B, quantity: 2 });
      await addToCart(USER_B, { productId: PRODUCT_A, quantity: 9 });

      const cart = await getCart(USER_A);

      expect(cart).toHaveLength(2);
      expect(cart.find((i) => i.productId === PRODUCT_A)?.quantity).toBe(1);
      expect(cart.find((i) => i.productId === PRODUCT_B)?.quantity).toBe(2);
    });

    it("returns an empty array, not an error, for a user with nothing in their cart", async () => {
      const cart = await getCart(USER_A);
      expect(cart).toEqual([]);
    });
  });
});
