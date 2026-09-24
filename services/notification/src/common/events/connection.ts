import amqp from "amqplib";
import type { ChannelModel, Channel } from "amqplib";
import config from "../config/index.js";
import ApiError from "../utils/api-errors.js";

let connection: ChannelModel | null = null;
let chanel: Channel | null = null;

const EXCHANGE_NAME = "flux.events";
const DLX_EXCHANGE = "flux.events.dlx";
const DLQ_NAME = "flux.events.dlq";

const connectRabbitMQ = async (): Promise<Channel> => {
  if (chanel) {
    return chanel;
  }
  connection = await amqp.connect(config.rabbitmq.url);
  connection.on("error", (err) => {
    console.error("[rabbitmq] connection error:", err.message);
  });

  connection.on("close", () => {
    console.error("[rabbitmq] connection closed");
    connection = null;
    chanel = null;
  });
  chanel = await connection.createChannel();
  await chanel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

  await chanel.assertExchange(DLX_EXCHANGE, "topic", { durable: true });
  await chanel.assertQueue(DLQ_NAME, { durable: true });
  await chanel.bindQueue(DLQ_NAME, DLX_EXCHANGE, "#");
  console.log("[rabbitmq] connected and channel ready");

  return chanel;
};

const getChannel = (): Channel => {
  if (!chanel) {
    throw ApiError.internal(
      "RabbitMQ channel not initialized. Call connectRabbitMQ() before publishing or subscribing.",
    );
  }

  return chanel;
};

const closeRabbitMQ = async (): Promise<void> => {
  if (chanel) {
    await chanel.close();
    chanel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
};

export { connectRabbitMQ, getChannel, closeRabbitMQ, EXCHANGE_NAME,DLX_EXCHANGE };
