import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { chargePayment } from "./payments.service.js";
import { ChargePaymentDto } from "./dto/payments.dto.js";

const handleChargePayment = async (payload: unknown) => {
  const { errors, value } = ChargePaymentDto.validate(payload);

  if (errors) {
    console.error(
      "[payment-saga] invalid ChargePayment payload:",
      errors.join("; "),
    );
    const { orderId } = payload as { orderId: string };
    if (orderId) {
      await publish("PaymentFailed", { orderId, paymentId: null });
    }
    return;
  }
  try {
    const payment = await chargePayment(value as any);

    if (payment?.status === "SUCCEEDED") {
      await publish("PaymentSucceeded", {
        orderId: payment.orderId,
        paymentId: payment.id,
      });
    } else {
      await publish("PaymentFailed", {
        orderId: payment?.orderId,
        paymentId: payment?.id,
      });
    }
  } catch (error) {
    console.error("[payment-saga] chargePayment threw:", error);
    const { orderId } = value as { orderId?: string };
    await publish("PaymentFailed", { orderId, paymentId: null })
  }
};

const registerPaymentSagaHandlers = async () => {
  await subscribe(
    "payment.charge-payment",
    "ChargePayment",
    handleChargePayment,
  );
  console.log("[payment-saga] all event handlers registered");
};

export { registerPaymentSagaHandlers, handleChargePayment };
