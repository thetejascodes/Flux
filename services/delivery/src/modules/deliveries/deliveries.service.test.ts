import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../common/db/index.js";
import { drivers, warehouses, deliveries } from "../../common/db/schema.js";
import { assignDelivery, findNearestAvailableDriver } from "./deliveries.service.js";
import { eq } from "drizzle-orm";

describe("assignDelivery concurrency", () => {
  let warehouseId: string;
  let driverId: string;

  beforeEach(async () => {
    await db.delete(deliveries);
    await db.delete(drivers);
    await db.delete(warehouses);

    warehouseId = randomUUID();
    driverId = randomUUID();

    await db.insert(warehouses).values({
      id: warehouseId,
      name: "Test Warehouse",
      latitude: "18.5204",
      longitude: "73.8567",
    });

    await db.insert(drivers).values({
      id: driverId,
      name: "Test Driver",
      status: "AVAILABLE",
      currentLatitude: "18.5300",
      currentLongitude: "73.8600",
    });
  });

  it("allows exactly 1 success out of 10 concurrent assignment attempts for 1 available driver", async () => {
    const orderIds = Array.from({ length: 10 }, () => randomUUID());

    const results = await Promise.allSettled(
      orderIds.map((orderId) => assignDelivery(orderId, warehouseId, 18.5204, 73.8567)),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(9);

    for (const f of failed) {
      expect(f.reason?.message ?? String(f.reason)).toMatch(/available|conflict/i);
    }

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver?.status).toBe("BUSY");

    const deliveryRows = await db.select().from(deliveries).where(eq(deliveries.warehouseId, warehouseId));
    expect(deliveryRows.length).toBe(1);
  });

  it("throws a clean conflict error when no drivers are available at all", async () => {
    await db.update(drivers).set({ status: "OFFLINE" }).where(eq(drivers.id, driverId));

    await expect(
      assignDelivery(randomUUID(), warehouseId, 18.5204, 73.8567),
    ).rejects.toThrow(/no available drivers/i);
  });

  it("leaves the driver AVAILABLE if the delivery insert fails after the driver is claimed", async () => {
    await expect(
      assignDelivery(randomUUID(), "not-a-real-uuid", 18.5204, 73.8567),
    ).rejects.toThrow();

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver?.status).toBe("AVAILABLE");
  });
});

describe("findNearestAvailableDriver", () => {
  beforeEach(async () => {
    await db.delete(deliveries);
    await db.delete(drivers);
    await db.delete(warehouses);
  });

  it("selects the closer of two available drivers, not just the first one found", async () => {
    const warehouseLat = 18.5204;
    const warehouseLon = 73.8567;

    const farDriverId = randomUUID();
    const nearDriverId = randomUUID();

    await db.insert(drivers).values([
      {
        id: farDriverId,
        name: "Far Driver",
        status: "AVAILABLE",
        currentLatitude: "19.0760",
        currentLongitude: "72.8777",
      },
      {
        id: nearDriverId,
        name: "Near Driver",
        status: "AVAILABLE",
        currentLatitude: "18.5210",
        currentLongitude: "73.8570",
      },
    ]);

    const { driver } = await findNearestAvailableDriver(warehouseLat, warehouseLon);
    expect(driver.id).toBe(nearDriverId);
  });
});
