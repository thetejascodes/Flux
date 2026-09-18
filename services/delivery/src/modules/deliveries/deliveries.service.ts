import { db } from "../../common/db/index.js";
import { drivers, deliveries } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";

const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};

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

const estimateArrival = (distanceKm: number):Date=>{
    const hours = distanceKm / AVERAGE_SPEED_KM_PER_HOUR;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}
