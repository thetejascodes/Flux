import { pool } from "../../common/db/index.js";
import {
  findExpiredPendingReservations,
  releaseReservation,
} from "./stock.service.js";
import ApiError from "../../common/utils/api-error.js";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000; // 60s
const EXPIRY_JOB_LOCK_KEY = 1001;

const expirePendingReservations = async () => {
  const client = await pool.connect();

  try {
    const {
      rows: [{ acquired }],
    } = await client.query(
      "SELECT pg_try_advisory_lock($1) as acquired",
      [EXPIRY_JOB_LOCK_KEY],
    );

    if (!acquired) {
      return;
    }

    try {
      const expired = await findExpiredPendingReservations();
      if (expired.length === 0) {
        return;
      }
      let releasedCount = 0;
      for (const { id } of expired) {
        try {
          await releaseReservation(id);
          releasedCount++;
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 409) {
            continue;
          }
          console.log(`[expiry-job] failed to release reservation ${id}:`, error);
        }
      }

      if (releasedCount > 0) {
        console.log(
          `[expiry-job] auto-released ${releasedCount} expired reservation(s)`,
        );
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [EXPIRY_JOB_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
};

const startExpiryJob = () => {
  setInterval(() => {
    expirePendingReservations().catch((err) =>
      console.error("[expiry-job] unexpected error:", err),
    );
  }, EXPIRY_CHECK_INTERVAL_MS);
  console.log("[expiry-job] started, checking every 60s");
};

export { startExpiryJob, expirePendingReservations };