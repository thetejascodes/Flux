import * as stockService from "./stock.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";
import type {
  ReserveStockInput,
  ReservationIdParams,
} from "./dto/stock.dto.js";

const reserveStock = async (
  req: Request<{}, {}, ReserveStockInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await stockService.reserveStock(req.body);
    return ApiResponse.created(res, "Stock reserved successfully", result);
  } catch (error) {
    next(error);
  }
};

const releaseReservation = async (
  req: Request<ReservationIdParams>,
  res: Response,
  next: NextFunction,
) => {
    try {
        await stockService.releaseReservation(req.params.id);
        return ApiResponse.ok(res,"Reservation released successfully",null);
    } catch (error) {
        next(error);
    }
};
