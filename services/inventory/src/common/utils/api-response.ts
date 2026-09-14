import type { Response } from "express";

class ApiResponse {
  static ok<T = unknown>(res: Response, message: string, data: T | null = null) {
    return res.status(200).json({ status: "success", message, data });
  }
  static created<T = unknown>(res: Response, message: string, data: T | null = null) {
    return res.status(201).json({ status: "success", message, data });
  }
  static noContent(res: Response) {
    return res.status(204).send();
  }
}

export default ApiResponse;