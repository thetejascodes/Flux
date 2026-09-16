import * as orderService from "./orders.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";
import type { PlaceOrderInput, OrderIdParams } from "./dto/orders.dto.js";
import ApiError from "../../common/utils/api-error.js";

const placeOrder = async (
  req: Request<{}, {}, PlaceOrderInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw ApiError.unauthorized("Missing user identity");
    }
    const result = await orderService.placeOrder(userId, req.body);
    return ApiResponse.created(res, "Order placed successfully", result);
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (
  req: Request<OrderIdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await orderService.getOrderById(req.params.id);
    return ApiResponse.ok(res, "Order fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

