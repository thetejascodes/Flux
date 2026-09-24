import { createProxyMiddleware } from "http-proxy-middleware";

const proxyTo = (target: string) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: any) => {
        if (req.userId) {
          proxyReq.setHeader("x-user-id", req.userId);
        }
        if (req.userRole) {
          proxyReq.setHeader("x-user-role", req.userRole);
        }
      },
    },
  });
};

export default proxyTo;
