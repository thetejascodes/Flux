import pino from "pino";
import { trace } from "@opentelemetry/api";

const serviceName = process.env.SERVICE_NAME ?? "unknown-service";

const base = pino({
  name: serviceName,
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

const traceContext = () => {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId };
};
const logger = {
  info: (msg: string, extra: Record<string, unknown> = {}) =>
    base.info(
      {
        ...traceContext(),
        ...extra,
      },
      msg,
    ),
  warn: (msg: string, extra: Record<string, unknown> = {}) =>
    base.warn(
      {
        ...traceContext(),
        ...extra,
      },
      msg,
    ),
  error: (msg: string, extra: Record<string, unknown> = {}) =>
    base.error(
      {
        ...traceContext(),
        ...extra,
      },
      msg,
    ),
  debug: (msg: string, extra: Record<string, unknown> = {}) =>
    base.debug({ ...traceContext(), ...extra }, msg),
};

export default logger;