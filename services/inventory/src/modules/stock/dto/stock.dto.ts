import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";
 
class ReserveStockDto extends BaseDto {
  static schema = z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: z.number().int().positive(),
    orderId: z.string().uuid(),
  });
}

class ReservationIdParamsDto extends BaseDto {
  static schema = z.object({
    id: z.string().uuid(),
  });
}


export type ReserveStockInput = z.infer<typeof ReserveStockDto.schema>;
export type ReservationIdParams = z.infer<typeof ReservationIdParamsDto.schema>;

export { ReserveStockDto, ReservationIdParamsDto };
