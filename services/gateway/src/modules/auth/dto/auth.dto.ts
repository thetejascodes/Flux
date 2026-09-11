import BaseDto from "../../../common/dto/baseDto.js";
import { z } from "zod";

class SignUpDto extends BaseDto {
  static schema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });
}

class LoginDto extends BaseDto {
  static schema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password is required"),
  });
}

class RefreshDto extends BaseDto {
  static schema = z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  });
}

export type SignUpInput = z.infer<typeof SignUpDto.schema>;
export type LoginInput = z.infer<typeof LoginDto.schema>;
export type RefreshInput = z.infer<typeof RefreshDto.schema>;

export { SignUpDto, LoginDto, RefreshDto };