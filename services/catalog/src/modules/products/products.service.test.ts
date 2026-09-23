import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { products } from "../../common/db/schema.js";
import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "./products.service.js";
import { eq } from "drizzle-orm";

const seedProduct = async (overrides: Partial<typeof products.$inferInsert> = {}) => {
  const [product] = await db
    .insert(products)
    .values({
      id: randomUUID(),
      name: "Seeded Widget",
      description: "A pre-existing product",
      category: "seeded",
      price: "10.00",
      ...overrides,
    })
    .returning();
  return product!;
};

describe("createProduct", () => {
  it("creates a product and stores price as a string, not a float", async () => {
    const product = await createProduct({
      name: "Test Widget",
      description: "A widget for testing",
      category: "testing",
      price: 49.99,
    });

    expect(product.id).toBeTruthy();
    expect(product.name).toBe("Test Widget");
    expect(product.price).toBe("49.99");
    expect(typeof product.price).toBe("string");
  });

  it("preserves exact cents rather than rounding, e.g. 19.9 stays 19.90 not 19.9 or 20", async () => {
    const product = await createProduct({
      name: "Odd Price Widget",
      description: null as any,
      category: "testing",
      price: 19.9,
    });

    expect(product.price).toBe("19.90");
  });
});

describe("getProductById", () => {
  it("returns the product when it exists", async () => {
    const seeded = await seedProduct();
    const product = await getProductById(seeded.id);
    expect(product.id).toBe(seeded.id);
    expect(product.name).toBe(seeded.name);
  });

  it("throws a not-found error for a nonexistent product", async () => {
    await expect(getProductById(randomUUID())).rejects.toThrow(/not found/i);
  });
});

describe("listProducts", () => {
  beforeEach(async () => {
    await db.delete(products);
  });

  it("returns all products when no category filter is given", async () => {
    await seedProduct({ id: randomUUID(), category: "electronics" });
    await seedProduct({ id: randomUUID(), category: "groceries" });

    const results = await listProducts({ page: 1, limit: 10 } as any);
    expect(results.length).toBe(2);
  });

  it("filters by category when one is provided", async () => {
    await seedProduct({ id: randomUUID(), name: "Phone", category: "electronics" });
    await seedProduct({ id: randomUUID(), name: "Apples", category: "groceries" });

    const results = await listProducts({ category: "electronics", page: 1, limit: 10 } as any);
    expect(results.length).toBe(1);
    expect(results[0]?.category).toBe("electronics");
  });

  it("respects pagination — limit and page correctly slice the results", async () => {
    for (let i = 0; i < 5; i++) {
      await seedProduct({ id: randomUUID(), name: `Product ${i}` });
    }

    const firstPage = await listProducts({ page: 1, limit: 2 } as any);
    const secondPage = await listProducts({ page: 2, limit: 2 } as any);

    expect(firstPage.length).toBe(2);
    expect(secondPage.length).toBe(2);
    expect(firstPage[0]?.id).not.toBe(secondPage[0]?.id);
  });

  it("returns an empty array when no products match the given category", async () => {
    await seedProduct({ id: randomUUID(), category: "electronics" });

    const results = await listProducts({ category: "nonexistent-category", page: 1, limit: 10 } as any);
    expect(results.length).toBe(0);
  });
});

describe("updateProduct", () => {
  it("updates only the provided fields, leaving others untouched", async () => {
    const seeded = await seedProduct({ name: "Original Name", price: "10.00" });

    const updated = await updateProduct(seeded.id, { price: 15.5 } as any);

    expect(updated.price).toBe("15.50");
    expect(updated.name).toBe("Original Name"); // unchanged
  });

  it("updates the name without requiring price", async () => {
    const seeded = await seedProduct({ name: "Original Name" });

    const updated = await updateProduct(seeded.id, { name: "New Name" } as any);

    expect(updated.name).toBe("New Name");
  });

  it("throws a not-found error when updating a nonexistent product", async () => {
    await expect(
      updateProduct(randomUUID(), { name: "Doesn't Matter" } as any),
    ).rejects.toThrow(/not found/i);
  });

  it("does not crash or set price to the string 'undefined' when price is omitted", async () => {
    const seeded = await seedProduct({ price: "10.00" });

    const updated = await updateProduct(seeded.id, { name: "Updated Name" } as any);

    expect(updated.price).toBe("10.00"); // untouched, not corrupted
  });
});