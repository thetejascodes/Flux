import { Router } from "express";
import * as stockController from "./stock.controller.js";
import validate from "../../common/middleware/validate.js";
import { ReserveStockDto } from "./dto/stock.dto.js";

const router = Router();

router.post(
  "/",
  validate(ReserveStockDto),
  stockController.reserveStock,
);

router.patch("/:id/release", stockController.releaseReservation);

router.patch("/:id/confirm", stockController.confirmReservation);

export default router;
