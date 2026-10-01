import * as cartService from "./carts.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import ApiError from "../../common/utils/api-error.js";
import logger from "../../common/logger.js";
import type { Request, Response, NextFunction } from "express";
import type {
  AddCartItemInput,
  UpdateCartItemInput,
  CartItemParams,
} from "./dto/cart.dto.js";

const addToCart = async (
  req: Request<{}, {}, AddCartItemInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw ApiError.unauthorized("Missing user identity");
    }
    const result = await cartService.addToCart(userId, req.body);
    logger.info("item added to cart", {
      userId,
      productId: req.body.productId,
      quantity: req.body.quantity,
    });
    return ApiResponse.created(res, "Item added to cart", result);
  } catch (error) {
    next(error);
  }
};

const updateCartItemQuantity = async (
  req: Request<CartItemParams, {}, UpdateCartItemInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw ApiError.unauthorized("Missing user identity");
    }
    const result = await cartService.updateCartItemQuantity(
      userId,
      req.params.productId,
      req.body,
    );
    logger.info("cart item quantity updated", {
      userId,
      productId: req.params.productId,
      quantity: req.body.quantity,
    });
    return ApiResponse.ok(res, "Cart item updated", result);
  } catch (error) {
    next(error);
  }
};

const removeFromCart = async (
  req: Request<CartItemParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw ApiError.unauthorized("Missing user identity");
    }
    const result = await cartService.removeFromCart(
      userId,
      req.params.productId,
    );
    logger.info("item removed from cart", {
      userId,
      productId: req.params.productId,
    });
    return ApiResponse.ok(res, "Item removed from cart", result);
  } catch (error) {
    next(error);
  }
};

const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw ApiError.unauthorized("Missing user identity");
    }
    const result = await cartService.getCart(userId);
    return ApiResponse.ok(res, "Cart fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

export { addToCart, updateCartItemQuantity, removeFromCart, getCart };
