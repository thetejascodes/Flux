import ApiError from "../utils/api-errors.js";
import type { Request, Response, NextFunction } from "express";

type DtoClass = {
  validate: (data: unknown) => { value: unknown; errors: string[] | null };
};

const validate = (DtoClass: DtoClass) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { errors, value } = DtoClass.validate(req.body);
    if (errors) throw ApiError.badRequest(errors.join("; "));
    req.body = value;
    next();
  };
};

const validateQuery = (DtoClass: DtoClass) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { errors, value } = DtoClass.validate(req.query);
    if (errors) throw ApiError.badRequest(errors.join("; "));
    Object.assign(req.query, value);
    next();
  };
};

export default validate;
export { validateQuery };
