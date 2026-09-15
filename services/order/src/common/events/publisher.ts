import { getChannel, EXCHANGE_NAME } from "./connection.js";
import ApiError from "../utils/api-error.js";

const publish = async (
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const channel = getChannel();
  const message = Buffer.from(JSON.stringify(payload));
  const published = channel.publish(EXCHANGE_NAME, routingKey, message, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
  });
  if (!published) {
    throw ApiError.internal(
      `Failed to publish event "${routingKey}" — channel buffer full or exchange unreachable.`,
    );
  }
  console.log(`[rabbitmq] published event: ${routingKey}`);
};

export { publish };