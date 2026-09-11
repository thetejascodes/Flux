import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/index.js";
import ApiError from "./api-error.js";

export const generateAccessToken = (payload: { userId: string }) => {
  const options: SignOptions = {
    expiresIn: config.jwt.accessExpiresIn as NonNullable<
      SignOptions["expiresIn"]
    >,
    algorithm: "RS256",
  };
  return jwt.sign(payload, config.jwt.privateKey, options);
};

export const verifyAccessToken = (token: string) => {
  const payload = jwt.verify(token, config.jwt.publicKey, {
    algorithms: ["RS256"],
  });
  if (typeof payload === "string" || !("userId" in payload)) {
    throw ApiError.internal("unexpected token payload");
  }
  return payload;
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashRefreshToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
