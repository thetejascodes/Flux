import { Router } from "express";
import * as stockController from "./stock.controller.js";
import validate from "../../common/middleware/validate.js";
import { ReserveStockDto } from "./dto/stock.dto.js";

const router = Router();

router.post(
  "/reservations",
  validate(ReserveStockDto),
  stockController.reserveStock,
);

router.patch("/reservations/:id/release", stockController.releaseReservation);

router.patch("/reservations/:id/confirm", stockController.confirmReservation);

export default router;
