import type { Request, Response, NextFunction } from "express";
import { redis } from "../redis/client.js";
import ApiError from "../utils/api-error.js";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const rateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, keyPrefix } = options;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identifier = req.ip ?? "unknown";
      const key = `ratelimit:${keyPrefix}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}-${Math.random()}`);
      multi.zcard(key);
      multi.pexpire(key, windowMs);

      const result = await multi.exec();
      const count = result?.[2]?.[1] as number;

      if (count > max) {
        throw ApiError.tooManyRequests(
          "Too many requests. Please try again later.",
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};


