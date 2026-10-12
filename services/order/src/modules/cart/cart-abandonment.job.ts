import { db } from "../../common/db/index.js";
import { publish } from "../../common/events/publisher.js";
import logger from "../../common/logger.js";
import config from "../../common/config/index.js";

const LOCK_KEY = 1003;

const ABANDON_AFTER_MINUTES = config.cart.abandonAfterMinutes;
const SWEEP_INTERVAL_MS = config.cart.sweepIntervalMs;
const BATCH_SIZE = config.cart.sweepBatchSize;

const STALE_USERS_SQL = `
  SELECT c.user_id AS "userId",
         max(c.updated_at)::text AS "lastActivity"
  FROM cart_items c
  LEFT JOIN cart_reminders r ON r.user_id = c.user_id
  GROUP BY c.user_id, r.reminded_activity_at
  HAVING max(c.updated_at) < now() - make_interval(mins => $1::int)
     AND (r.reminded_activity_at IS NULL
          OR r.reminded_activity_at < max(c.updated_at))
  ORDER BY max(c.updated_at)
  LIMIT $2
`;

const UPSERT_REMINDER_SQL = `
  INSERT INTO cart_reminders (user_id, reminder_sent_at, reminded_activity_at)
  VALUES ($1, now(), $2::timestamptz)
  ON CONFLICT (user_id) DO UPDATE
    SET reminder_sent_at = now(),
        reminded_activity_at = EXCLUDED.reminded_activity_at
`;

type SweepOptions = { abandonAfterMinutes?: number; batchSize?: number };

export async function runCartAbandonmentSweep(
  options: SweepOptions = {},
): Promise<number> {
  const minutes = options.abandonAfterMinutes ?? ABANDON_AFTER_MINUTES;
  const batch = options.batchSize ?? BATCH_SIZE;

  const client = await db.$client.connect();
  let acquired = false;
  let reminded = 0;

  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [LOCK_KEY],
    );
    acquired = lock.rows[0].acquired;
    if (!acquired) return 0; // another instance has this cycle

    const { rows: stale } = await client.query(STALE_USERS_SQL, [
      minutes,
      batch,
    ]);

    for (const { userId, lastActivity } of stale) {
      try {
        const { rows: items } = await client.query(
          `SELECT product_id AS "productId", quantity
           FROM cart_items WHERE user_id = $1`,
          [userId],
        );
        if (items.length === 0) continue; // checked out since the query

        await publish("CartAbandoned", { userId, items, lastActivity });
        await client.query(UPSERT_REMINDER_SQL, [userId, lastActivity]);
        reminded++;
      } catch (err) {
        logger.error("cart abandonment failed for user", { userId, err });
      }
    }

    if (reminded > 0) {
      logger.info("cart abandonment sweep done", { reminded });
    }
    return reminded;
  } finally {
    if (acquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
    client.release();
  }
}

let running = false;

export function startCartAbandonmentJob() {
  const timer = setInterval(async () => {
    if (running) return; // don't overlap with a slow sweep in this process
    running = true;
    try {
      await runCartAbandonmentSweep();
    } catch (err) {
      logger.error("cart abandonment sweep crashed", { err });
    } finally {
      running = false;
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
