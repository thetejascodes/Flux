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

export default router;
