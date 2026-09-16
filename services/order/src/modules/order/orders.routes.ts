import { Router } from "express";
import * as ordersController from "./orders.controller.js";
import validate from "../../common/middleware/validate.js";
import { PlaceOrderDto } from "./dto/orders.dto.js";

const router = Router();

router.post("/", validate(PlaceOrderDto), ordersController.placeOrder);

router.get("/:id", ordersController.getOrderById);
export default router;
