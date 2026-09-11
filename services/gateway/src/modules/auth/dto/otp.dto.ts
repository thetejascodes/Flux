import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class RequestOtpDto extends BaseDto {
  static schema = z.object({
    phone: z.string().min(10).max(15),
  });
}

class VerifyOtpDto extends BaseDto {
  static schema = z.object({
    phone: z.string().min(10).max(15),
    code: z.string().length(6),
  });
}

export type RequestOtpInput = z.infer<typeof RequestOtpDto.schema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpDto.schema>;

export { RequestOtpDto, VerifyOtpDto };