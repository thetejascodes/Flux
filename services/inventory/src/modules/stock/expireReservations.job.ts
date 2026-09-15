import {
  findExpiredPendingReservations,
  releaseReservation,
} from "./stock.service.js";
import ApiError from "../../common/utils/api-error.js";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000; // 60s

const expirePendingReservations = async () => {
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
};
