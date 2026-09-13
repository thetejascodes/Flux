import * as productService from "./products.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";
import type {
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from "./dto/products.dto.js";

const createProduct = async (
  req: Request<{}, {}, CreateProductInput>,
  res: Response,
  next: NextFunction,
) => {
    try {
        const result = await productService.createProduct(req.body);
        return ApiResponse.created(res,"Product created successfully",result);
    } catch (error) {
        next(error);
    }
};
