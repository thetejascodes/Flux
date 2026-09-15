import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class PlaceOrderDto extends BaseDto {
  static schema = z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: z.number().int().positive(),
  });
}

export type PlaceOrderInput = z.infer<typeof PlaceOrderDto.schema> & {
  userId: string;
};

export { PlaceOrderDto };
