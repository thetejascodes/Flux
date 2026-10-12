import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { cartItems } from "../../common/db/schema.js";
import { addToCart } from "./carts.service.js";
import { runCartAbandonmentSweep } from "./cart-abandonment.job.js";
import { publish } from "../../common/events/publisher.js";

vi.mock("../../common/events/publisher.js", () => ({
  publish: vi.fn().mockResolvedValue(undefined),
}));

const OPTS = { abandonAfterMinutes: 30 };
const USER = randomUUID();
const PRODUCT = randomUUID();

const backdate = (userId: string, minutes: number) =>
  db.execute(
    sql`UPDATE cart_items
        SET updated_at = now() - make_interval(mins => ${minutes})
        WHERE user_id = ${userId}`,
  );

// Other tests may leave stale carts in the DB, so only look at our user.
const remindersFor = (userId: string) =>
  vi
    .mocked(publish)
    .mock.calls.filter(
      ([routingKey, payload]) =>
        routingKey === "CartAbandoned" && (payload as any).userId === userId,
    );

describe("cart abandonment sweep", () => {
  beforeEach(async () => {
    vi.mocked(publish).mockClear();
    await db.delete(cartItems).where(eq(cartItems.userId, USER));
    await db.execute(sql`DELETE FROM cart_reminders WHERE user_id = ${USER}`);
  });

  it("reminds a stale cart exactly once", async () => {
    await addToCart(USER, { productId: PRODUCT, quantity: 2 });
    await backdate(USER, 60);

    await runCartAbandonmentSweep(OPTS);
    await runCartAbandonmentSweep(OPTS);

    expect(remindersFor(USER)).toHaveLength(1);
  });

  it("skips a fresh cart", async () => {
    await addToCart(USER, { productId: PRODUCT, quantity: 1 });

    await runCartAbandonmentSweep(OPTS);

    expect(remindersFor(USER)).toHaveLength(0);
  });

  it("re-arms the reminder after new cart activity", async () => {
    await addToCart(USER, { productId: PRODUCT, quantity: 1 });
    await backdate(USER, 60);
    await runCartAbandonmentSweep(OPTS);
    expect(remindersFor(USER)).toHaveLength(1);

    // new activity, newer than the first reminder but already past the threshold
    await addToCart(USER, { productId: PRODUCT, quantity: 1 });
    await backdate(USER, 40);
    await runCartAbandonmentSweep(OPTS);

    expect(remindersFor(USER)).toHaveLength(2);
  });

  it("skips a user whose cart was emptied", async () => {
    await addToCart(USER, { productId: PRODUCT, quantity: 1 });
    await backdate(USER, 60);
    await db.delete(cartItems).where(eq(cartItems.userId, USER));

    await runCartAbandonmentSweep(OPTS);

    expect(remindersFor(USER)).toHaveLength(0);
  });
});
