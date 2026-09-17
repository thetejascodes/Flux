import { subscribe } from "../../common/events/subscriber.js";
import { publish } from "../../common/events/publisher.js";
import { chargePayment } from "./payments.service.js";
import { ChargePaymentDto } from "./dto/payments.dto.js";

const registerPaymentSagaHandlers = async () => {
  await subscribe(
    "payment.charge-payment",
    "ChargePayment",
    async (payload) => {
      const { errors, value } = ChargePaymentDto.validate(payload);
      if (errors) {
        console.error(
          "[payment-saga] invalid ChargePayment payload:",
          errors.join("; "),
        );
        return;
      }
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
    },
  );
  console.log("[payment-saga] all event handlers registered");
};
export{ registerPaymentSagaHandlers };