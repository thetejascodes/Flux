import { getChannel, EXCHANGE_NAME, DLX_EXCHANGE } from "./connection.js";
import type { ConsumeMessage } from "amqplib";
import { context, propagation } from "@opentelemetry/api";

type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

const subscribe = async (
  queueName: string,
  routingKey: string,
  handler: EventHandler,
): Promise<void> => {
  const channel = getChannel();
  await channel.assertQueue(queueName, {
    durable: true,
    arguments: { "x-dead-letter-exchange": DLX_EXCHANGE },
  });
  await channel.bindQueue(queueName, EXCHANGE_NAME, routingKey);

  await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const extractedContext = propagation.extract(
      context.active(),
      msg.properties.headers ?? {},
    );

    try {
      const payload = JSON.parse(msg.content.toString());
      await context.with(extractedContext, () => handler(payload));
      channel.ack(msg);
    } catch (error) {
      console.error(
        `[rabbitmq] handler failed for queue "${queueName}", routing key "${routingKey}":`,
        error,
      );

      if (msg.fields.redelivered) {
        console.error(
          `[rabbitmq] giving up on message after 1 retry — queue="${queueName}" routingKey="${routingKey}"`,
        );
        channel.nack(msg, false, false);
      } else {
        channel.nack(msg, false, true);
      }
    }
  });

  console.log(
    `[rabbitmq] subscribed: queue="${queueName}" routingKey="${routingKey}"`,
  );
};

export { subscribe };
