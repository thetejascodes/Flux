import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class CreateProductDto extends BaseDto {
  static schema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().max(1000).optional(),
    price: z.number().positive("Price must be greater than 0"),
    category: z.string().optional(),
  });
}

class ListProductsQueryDto extends BaseDto {
  static schema = z.object({
    category: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  });
}

class UpdateProductDto extends BaseDto {
  static schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().max(1000).optional(),
    price: z.number().positive().optional(),
    category: z.string().optional(),
  });
}


export type CreateProductInput = z.infer<typeof CreateProductDto.schema>;
export type ListProductsQueryInput = z.infer<typeof ListProductsQueryDto.schema>;
export type UpdateProductInput = z.infer<typeof UpdateProductDto.schema>;


export { CreateProductDto, ListProductsQueryDto,UpdateProductDto };