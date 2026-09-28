import { Router } from "express";
import * as productController from "./products.controllers.js";
import validate, { validateQuery } from "../../common/middleware/validate.js";
import requireAdmin from "../../common/middleware/requireAdmin.js";
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
