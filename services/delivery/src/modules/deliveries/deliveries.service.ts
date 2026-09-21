import { db } from "../../common/db/index.js";
import { drivers, deliveries, warehouses } from "../../common/db/schema.js";
import { eq, and } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import haversineDistanceKm from "./geo.js";

const findNearestAvailableDriver = async (
  pickupLat: number,
  pickupLon: number,
) => {
  const availableDrivers = await db
    .select()
    .from(drivers)
    .where(eq(drivers.status, "AVAILABLE"));
  if (availableDrivers.length === 0) {
    throw ApiError.conflict("No available drivers");
  }
  let nearest = availableDrivers[0]!;
  let nearestDistance = haversineDistanceKm(
    pickupLat,
    pickupLon,
    parseFloat(nearest.currentLatitude),
    parseFloat(nearest.currentLongitude),
  );
  for (const driver of availableDrivers.slice(1)) {
    const distance = haversineDistanceKm(
      pickupLat,
      pickupLon,
      parseFloat(driver.currentLatitude),
      parseFloat(driver.currentLongitude),
    );
    if (distance < nearestDistance) {
      nearest = driver;
      nearestDistance = distance;
    }
  }
  return { driver: nearest, distanceKm: nearestDistance };
};

const AVERAGE_SPEED_KM_PER_HOUR = 25;

const estimateArrival = (distanceKm: number): Date => {
  const hours = distanceKm / AVERAGE_SPEED_KM_PER_HOUR;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const assignDelivery = async (
  orderId: string,
  warehouseId: string,
  warehouseLat: number,
  warehouseLon: number,
) => {
  const { driver, distanceKm } = await findNearestAvailableDriver(
    warehouseLat,
    warehouseLon,
  );

  const estimatedArrival = estimateArrival(distanceKm);

  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(drivers)
      .set({ status: "BUSY" })
      .where(and(eq(drivers.id, driver.id), eq(drivers.status, "AVAILABLE")))
      .returning();

    if (claimed.length === 0) {
      throw ApiError.conflict("Driver was claimed by another delivery — retry");
    }

    const [delivery] = await tx
      .insert(deliveries)
      .values({
        orderId,
        warehouseId,
        driverId: driver.id,
        status: "ASSIGNED",
        estimatedArrival,
      })
      .returning();

    if (!delivery) {
      throw ApiError.internal("Failed to create delivery");
    }

    return delivery;
  });
};
const getDeliveryByOrderId = async (orderId: string) => {
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.orderId, orderId));
  if (!delivery) {
    throw ApiError.notFound("Delivery not found");
  }
  return delivery;
};
const getWarehouseById = async (warehouseId: string) => {
  const [warehouse] = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId));

  if (!warehouse) {
    throw ApiError.notFound("Warehouse not found");
  }
  return warehouse;
};

export {
  haversineDistanceKm,
  findNearestAvailableDriver,
  assignDelivery,
  getDeliveryByOrderId,
  getWarehouseById,
};
