import type { Request, Response, NextFunction } from "express";
import ApiError from "../utils/api-error.js";
import logger from "../logger.js";

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let status = 500;
  let message = "Internal Server Error";

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
  } else if (err.code === "23505") {
    status = 409;
    message = "A record with this value already exists";
  } else if (err.code === "23503") {
    status = 400;
    message = "Related record not found";
  } else if (err.name === "JsonWebTokenError") {
    status = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    status = 401;
    message = "Token expired";
  } else if (err.statusCode && err.statusCode < 500) {
    status = err.statusCode;
    message = err.message;
  }

  const context = {
    status,
    method: req.method,
    path: req.originalUrl,
  };

  if (status >= 500) {
    logger.error(err.message, { ...context, err });
  } else {
    logger.warn(message, { ...context, code: err.code });
  }

  return res.status(status).json({
    status: "error",
    message,
    data: null,
  });
};

export default errorHandler;