import { db } from "../../common/db/index.js";
import { reservations, stock } from "../../common/db/schema.js";
import { eq, and, sql, gte } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import { redis } from "../../common/redis/client.js";
import type {
  ReserveStockInput,
  ReservationIdParams,
} from "./dto/stock.dto.js";

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const reserveStock = async (input: ReserveStockInput) => {
  const { productId, warehouseId, quantity, orderId } = input;
  const updated = await db
    .update(stock)
    .set({
      quantityAvailable: sql`${stock.quantityAvailable} - ${quantity}`,
      quantityReserved: sql`${stock.quantityReserved} + ${quantity}`,
    })
    .where(
      and(
        eq(stock.productId, productId),
        eq(stock.warehouseId, warehouseId),
        gte(stock.quantityAvailable, quantity),
      ),
    )
    .returning();
  if (updated.length === 0) {
    throw ApiError.conflict("Insufficient stock");
  }
  const [reservation] = await db
    .insert(reservations)
    .values({
      productId,
      warehouseId,
      quantity,
      orderId,
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      status: "PENDING",
    })
    .returning();
  if (!reservation) {
    throw ApiError.internal("Failed to create reservation");
  }
  await redis.setex(`reservation:${reservation.id}`, 600, "active");
  return reservation;
};

const releaseReservation = async (reservationId: string) => {
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) {
    throw ApiError.notFound("Reservation not found");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(stock)
      .set({
        quantityAvailable: sql`${stock.quantityAvailable} + ${reservation.quantity}`,
        quantityReserved: sql`${stock.quantityReserved} - ${reservation.quantity}`,
      })
      .where(
        and(
          eq(stock.productId, reservation.productId),
          eq(stock.warehouseId, reservation.warehouseId),
        ),
      );
    await tx
      .update(reservations)
      .set({ status: "RELEASED" })
      .where(eq(reservations.id, reservationId));
  });
  await redis.del(`reservation:${reservationId}`);
};

const confirmReservation = async (reservationId: string) => {
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) {
    throw ApiError.notFound("Reservation not found");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(stock)
      .set({
        quantityReserved: sql`${stock.quantityReserved} - ${reservation.quantity}`,
      })
      .where(
        and(
          eq(stock.productId, reservation.productId),
          eq(stock.warehouseId, reservation.warehouseId),
        ),
      );
    await tx
      .update(reservations)
      .set({ status: "CONFIRMED" })
      .where(eq(reservations.id, reservationId));
  });
};
