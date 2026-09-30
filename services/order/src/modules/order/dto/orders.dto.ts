import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class PlaceOrderDto extends BaseDto {
  static schema = z.object({
    warehouseId: z.string().uuid(),
    items: z.array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    ).min(1),
  });
}

class OrderIdParamsDto extends BaseDto {
  static schema = z.object({
    id: z.string().uuid(),
  });
}

export type PlaceOrderInput = z.infer<typeof PlaceOrderDto.schema>;
export type OrderIdParams = z.infer<typeof OrderIdParamsDto.schema>;

export { PlaceOrderDto, OrderIdParamsDto };
