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
    return ApiResponse.created(res, "Product created successfully", result);
  } catch (error) {
    next(error);
  }
};

const getProductById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await productService.getProductById(req.params.id as string);
    return ApiResponse.ok(res, "Product fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

const listProducts = async (
  req: Request<{}, {}, {}, ListProductsQueryInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await productService.listProducts(req.query);
    return ApiResponse.ok(res, "Products fetched successfully", result);
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (
  req: Request<{ id: string }, {}, UpdateProductInput>,
  res: Response,
  next: NextFunction,
) => {
    try {
        const result = await productService.updateProduct(req.params.id,req.body);
        return ApiResponse.ok(res,"Product updated successfully",result);
    } catch (error) {
        next(error);
    }
};

export { createProduct,getProductById,listProducts,updateProduct };