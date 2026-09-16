import { getChannel, EXCHANGE_NAME } from "./connection.js";
import type { ConsumeMessage } from "amqplib";

type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

const subscribe = async (
  queueName: string,
  routingKey: string,
  handler: EventHandler,
): Promise<void> => {
  const channel = getChannel();
  await channel.assertQueue(queueName, { durable: true });
  await channel.bindQueue(queueName, EXCHANGE_NAME, routingKey);

  await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload);
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
        channel.nack(msg, false, true);
      }
    }
  });

  console.log(
    `[rabbitmq] subscribed: queue="${queueName}" routingKey="${routingKey}"`,
  );
};

export { subscribe };
