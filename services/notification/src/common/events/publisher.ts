import { getChannel, EXCHANGE_NAME } from "./connection.js";
import ApiError from "../utils/api-errors.js";
import { context, propagation } from "@opentelemetry/api";

const publish = async (
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const channel = getChannel();
  const message = Buffer.from(JSON.stringify(payload));

  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);

  const published = channel.publish(EXCHANGE_NAME, routingKey, message, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
    headers,
  });

  if (!published) {
    throw ApiError.internal(
      `Failed to publish event "${routingKey}" — channel buffer full or exchange unreachable.`,
    );
  }

  console.log(`[rabbitmq] published event: ${routingKey}`);
};

export { publish };
