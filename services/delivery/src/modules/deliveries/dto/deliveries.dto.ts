import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class AssignDeliveryDto extends BaseDto {
  static schema = z.object({
    orderId: z.string().uuid(),
    warehouseId: z.string().uuid(),
  });
}

export type AssignDeliveryInput  = z.infer<typeof AssignDeliveryDto.schema>;

export { AssignDeliveryDto };
