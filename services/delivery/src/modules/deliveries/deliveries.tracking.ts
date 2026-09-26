import { pool, db } from "../../common/db/index.js";
import { deliveries, drivers, warehouses } from "../../common/db/schema.js";
import { eq } from "drizzle-orm";
import { broadcastDeliveryUpdate } from "../../common/websocket/websocket.js";
import haversineDistanceKm from "./geo.js";

const TICK_INTERVAL_MS = 5 * 1000;
const ARRIVAL_THRESHOLD_KM = 0.05;
const STEP_FRACTION = 0.05; // 5% per tick instead of 15%
const TRACKING_JOB_LOCK_KEY = 1002; // arbitrary, unique per job across the whole DB

const stepToward = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  fraction: number,
) => ({
  lat: fromLat + (toLat - fromLat) * fraction,
  lon: fromLon + (toLon - fromLon) * fraction,
});

const tick = async () => {
  const client = await pool.connect();

  try {
    const {
      rows: [{ acquired }],
    } = await client.query(
      "SELECT pg_try_advisory_lock($1) as acquired",
      [TRACKING_JOB_LOCK_KEY],
    );

    if (!acquired) {
      return; // another instance is already ticking this interval
    }

    try {
      const activeDeliveries = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.status, "ASSIGNED"));

      for (const delivery of activeDeliveries) {
        if (!delivery.driverId || !delivery.warehouseId) {
          continue;
        }
        const [driver] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.id, delivery.driverId));
        const [warehouse] = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, delivery.warehouseId));

        if (!driver || !warehouse) {
          continue;
        }
        const driverLat = parseFloat(driver.currentLatitude);
        const driverLon = parseFloat(driver.currentLongitude);
        const destLat = parseFloat(warehouse.latitude);
        const destLon = parseFloat(warehouse.longitude);

        const remainingKm = haversineDistanceKm(
          driverLat,
          driverLon,
          destLat,
          destLon,
        );
        if (remainingKm <= ARRIVAL_THRESHOLD_KM) {
          await db
            .update(deliveries)
            .set({ status: "DELIVERED" })
            .where(eq(deliveries.id, delivery.id));
          await db
            .update(drivers)
            .set({ status: "AVAILABLE" })
            .where(eq(drivers.id, driver.id));

          broadcastDeliveryUpdate(delivery.orderId, {
            status: "DELIVERED",
            latitude: destLat,
            longitude: destLon,
          });
          console.log(
            `[tracking] delivery ${delivery.id} arrived, driver ${driver.id} freed`,
          );
          continue;
        }
        const next = stepToward(
          driverLat,
          driverLon,
          destLat,
          destLon,
          STEP_FRACTION,
        );
        await db
          .update(drivers)
          .set({
            currentLatitude: next.lat.toFixed(6),
            currentLongitude: next.lon.toFixed(6),
          })
          .where(eq(drivers.id, driver.id));

        broadcastDeliveryUpdate(delivery.orderId, {
          status: "IN_TRANSIT",
          latitude: next.lat,
          longitude: next.lon,
          remainingKm: Number(remainingKm.toFixed(2)),
        });
        console.log(
          `[tracking] delivery ${delivery.id}: ${remainingKm.toFixed(2)}km remaining, driver now at (${next.lat.toFixed(4)}, ${next.lon.toFixed(4)})`,
        );
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [TRACKING_JOB_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
};

const startTrackingSimulation = () => {
  setInterval(() => {
    tick().catch((err) => console.error("[tracking] unexpected error:", err));
  }, TICK_INTERVAL_MS);
  console.log(
    `[tracking] simulation started, updating every ${TICK_INTERVAL_MS / 1000}s`,
  );
};

export default startTrackingSimulation;