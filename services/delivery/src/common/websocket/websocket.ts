import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

const initSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }, // fine for a demo; restrict in real deployment
  });
  io.on("connection", (socket) => {
    socket.on("subscribe", (orderId: string) => {
      socket.join(`order:${orderId}`);
    });
    socket.on("unsubscribe", (orderId: string) => {
      socket.leave(`order:${orderId}`);
    });
  });
  console.log("[websocket] Socket.IO server ready");
  return io;
};
