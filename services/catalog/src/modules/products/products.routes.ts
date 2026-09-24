import { Router } from "express";
import * as productController from "./products.controllers.js";
import validate, { validateQuery } from "../../common/middlewares/validate.js";
import requireAdmin from "../../common/middlewares/requireAdmin.js";
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from "./dto/products.dto.js";

const router = Router();

router.get(
  "/",
  validateQuery(ListProductsQueryDto),
  productController.listProducts,
);

router.get("/:id", productController.getProductById);
router.post(
  "/",
  requireAdmin,
  validate(CreateProductDto),
  productController.createProduct,
);
router.patch(
  "/:id",
  requireAdmin,
  validate(UpdateProductDto),
  productController.updateProduct,
);

export default router;
