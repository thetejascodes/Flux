import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class AddCartItemDto extends BaseDto {
  static schema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  });
}

class UpdateCartItemDto extends BaseDto {
  static schema = z.object({
    quantity: z.number().int().positive(),
  });
}

class CartItemParamsDto extends BaseDto {
  static schema = z.object({
    productId: z.string().uuid(),
  });
}

export type AddCartItemInput = z.infer<typeof AddCartItemDto.schema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemDto.schema>;
export type CartItemParams = z.infer<typeof CartItemParamsDto.schema>;

export { AddCartItemDto, UpdateCartItemDto, CartItemParamsDto };
