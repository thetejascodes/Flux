import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class OrderConfirmedDto extends BaseDto {
  static schema = z.object({
    orderId: z.string().uuid(),
    warehouseId: z.string().uuid(),
  });
}

export type OrderConfirmedInput = z.infer<typeof OrderConfirmedDto.schema>;

export { OrderConfirmedDto };
