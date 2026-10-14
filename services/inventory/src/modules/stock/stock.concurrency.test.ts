import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { stock, reservations } from "../../common/db/schema.js";
import { reserveStock } from "./stock.service.js";
import { eq, and } from "drizzle-orm";

const PRODUCT_ID = "03208b3e-8eaa-4163-8fa8-914e99f204e2";
const WAREHOUSE_ID = "6193882b-fab5-4cde-9c0d-dd87b335c56e";

describe("reserveStock concurrency", () => {
  beforeEach(async () => {
    const [existing] = await db
      .select()
      .from(stock)
      .where(
        and(
          eq(stock.productId, PRODUCT_ID),
          eq(stock.warehouseId, WAREHOUSE_ID),
        ),
      );
    if (existing) {
      await db
        .update(stock)
        .set({ quantityAvailable: 1, quantityReserved: 0 })
        .where(eq(stock.id, existing.id));
    } else {
      await db.insert(stock).values({
        productId: PRODUCT_ID,
        warehouseId: WAREHOUSE_ID,
        quantityAvailable: 1,
        quantityReserved: 0,
      });
    }
    await db.delete(reservations).where(eq(reservations.productId, PRODUCT_ID));
  });
  it("allows exactly 1 success out of 100 concurrent requests for 1 unit of stock", async () => {
    const requests = Array.from({ length: 100 }, () =>
      reserveStock({
        productId: PRODUCT_ID,
        warehouseId: WAREHOUSE_ID,
        quantity: 1,
        orderId: randomUUID(),
      }),
    );
    const results = await Promise.allSettled(requests);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(99);
    for (const f of failed) {
      expect(f.reason?.message ?? String(f.reason)).toMatch(
        /insufficient stock/i,
      );
    }
  });
});
