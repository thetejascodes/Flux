import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import isAuthenticated from "./auth.middleware.js";
import { verifyAccessToken } from "../../common/utils/jwt.utils.js";

vi.mock("../../common/utils/jwt.utils.js", () => ({
  verifyAccessToken: vi.fn(),
}));

const makeReq = (authHeader?: string): Request =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
  }) as Request;

const makeRes = (): Response => ({}) as Response;

describe("isAuthenticated", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it("calls next() with no error and sets req.userId when the token is valid", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: "user-123" } as any);

    const req = makeReq("Bearer valid-token");
    await isAuthenticated(req, makeRes(), next);

    expect(req.userId).toBe("user-123");
    expect(next).toHaveBeenCalledWith(); // called with no arguments — success path
  });

  it("calls next(error) with a 401 when no Authorization header is present", async () => {
    const req = makeReq(undefined);
    await isAuthenticated(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = vi.mocked(next).mock.calls[0]![0];
    expect(errorArg).toBeDefined();
    expect((errorArg as any).statusCode).toBe(401);
  });

  it("calls next(error) with a 401 when the header doesn't start with 'Bearer '", async () => {
    const req = makeReq("Basic some-credentials");
    await isAuthenticated(req, makeRes(), next);

    const errorArg = vi.mocked(next).mock.calls[0]![0];
    expect((errorArg as any).statusCode).toBe(401);
  });

  it("calls next(error) when verifyAccessToken throws (expired or malformed token)", async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const req = makeReq("Bearer some-expired-token");
    await isAuthenticated(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = vi.mocked(next).mock.calls[0]![0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as unknown as Error).message).toMatch(/jwt expired/i);
  });

  it("strips only the 'Bearer ' prefix, passing the raw token to verifyAccessToken", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: "user-456" } as any);

    const req = makeReq("Bearer abc.def.ghi");
    await isAuthenticated(req, makeRes(), next);

    expect(verifyAccessToken).toHaveBeenCalledWith("abc.def.ghi");
  });
});