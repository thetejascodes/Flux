import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class ChargePaymentDto extends BaseDto {
  static schema = z.object({
    orderId: z.string().uuid(),
    amount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  });
}

export type ChargePaymentInput = z.infer<typeof ChargePaymentDto.schema>;

export { ChargePaymentDto };