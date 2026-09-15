import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class PlaceOrderDto extends BaseDto {
  static schema = z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: z.number().int().positive(),
  });
}
class OrderIdParamsDto extends BaseDto {
  static schema = z.object({
    id: z.string().uuid(),
  });
}

export type PlaceOrderInput = z.infer<typeof PlaceOrderDto.schema> & {
  userId: string;
};
export type OrderIdParams = z.infer<typeof OrderIdParamsDto.schema>;

export { PlaceOrderDto, OrderIdParamsDto };
