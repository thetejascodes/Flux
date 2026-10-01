import { Router } from "express";
import * as cartController from "./cart.controller.js";
import validate from "../../common/middleware/validate.js";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto.js";

const router = Router();

router.get("/", cartController.getCart);

router.post("/", validate(AddCartItemDto), cartController.addToCart);

router.patch(
  "/:productId",
  validate(UpdateCartItemDto),
  cartController.updateCartItemQuantity,
);

router.delete("/:productId", cartController.removeFromCart);

export default router;