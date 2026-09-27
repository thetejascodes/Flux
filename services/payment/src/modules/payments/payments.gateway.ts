import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { chargePayment } from "./payments.service.js";
import { ChargePaymentDto } from "./dto/payments.dto.js";
import logger from "../../common/logger.js";
const handleChargePayment = async (payload: unknown) => {
  const { errors, value } = ChargePaymentDto.validate(payload);

  if (errors) {
    logger.error("invalid ChargePayment payload", {
      errors: errors.join("; "),
    });

    const { orderId } = payload as { orderId: string };
    if (orderId) {
      await publish("PaymentFailed", { orderId, paymentId: null });
    }
    return;
  }
  logger.info("handling ChargePayment", {
    orderId: (value as any).orderId,
    amount: (value as any).amount,
  });

  try {
    const payment = await chargePayment(value as any);

    if (payment?.status === "SUCCEEDED") {
      logger.info("payment succeeded", {
        orderId: payment.orderId,
        paymentId: payment.id,
      });

      await publish("PaymentSucceeded", {
        orderId: payment.orderId,
        paymentId: payment.id,
      });
    } else {
      logger.warn("payment failed", {
        orderId: payment?.orderId,
        paymentId: payment?.id,
      });

      await publish("PaymentFailed", {
        orderId: payment?.orderId,
        paymentId: payment?.id,
      });
    }
  } catch (error) {
    logger.error("chargePayment threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    const { orderId } = value as { orderId?: string };
    await publish("PaymentFailed", { orderId, paymentId: null });
  }
};

const registerPaymentSagaHandlers = async () => {
  await subscribe(
    "payment.charge-payment",
    "ChargePayment",
    handleChargePayment,
  );
  logger.info("all event handlers registered");
};

export { registerPaymentSagaHandlers, handleChargePayment };
