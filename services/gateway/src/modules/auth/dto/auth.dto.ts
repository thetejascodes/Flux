import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class SignUpDto extends BaseDto {
  static schema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });
}

export type SignUpInput = z.infer<typeof SignUpDto.schema>;

export { SignUpDto };
