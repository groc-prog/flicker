import { AsyncLocalStorage } from 'node:async_hooks';

import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  ATTR_HOST_NAME,
  ATTR_PROCESS_PID,
  ATTR_PROCESS_RUNTIME_NAME,
  ATTR_PROCESS_RUNTIME_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';
import type { MaybePromise } from 'bun';
import pino from 'pino';

import 'dayjs/plugin/utc';

import { context, trace } from '@opentelemetry/api';

const storage = new AsyncLocalStorage<pino.Logger>();

const parentLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    bindings: (bindings) => ({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION,
      [ATTR_HOST_NAME]: bindings.hostname,
      [ATTR_PROCESS_PID]: bindings.pid,
      [ATTR_PROCESS_RUNTIME_NAME]: 'bun',
      [ATTR_PROCESS_RUNTIME_VERSION]: Bun.version,
    }),
    level: (label) => ({
      level: label.toUpperCase(),
    }),
  },
  mixin() {
    const currentSpan = trace.getSpan(context.active());
    if (!currentSpan) return {};

    const { traceId, spanId, traceFlags } = currentSpan.spanContext();
    return {
      'trace.id': traceId,
      'trace.flags': traceFlags,
      'span.id': spanId,
    };
  },
});
const proxiedParentLogger = new Proxy(parentLogger, {
  get(target, property, receiver) {
    const activeLogger = storage.getStore() || target;
    return Reflect.get(activeLogger, property, receiver);
  },
});

/**
 * Returns a new {@link pino.Logger} with all service defaults.
 * @param bindings - Additional bindings to apply.
 * @param options - Additional options to apply.
 * @returns A logger instance ready to be used.
 */
export function getLogger(bindings?: pino.Bindings, options?: pino.ChildLoggerOptions): pino.Logger {
  return proxiedParentLogger.child(bindings ?? {}, options);
}

/**
 * Attaches additional bindings to all log messages while in the scope of this
 * function's callback.
 *
 * This will either create a new child logger from a already existing scoped logger
 * or from the root logger, if not currently in a scoped context already.
 * @param bindings - Additional bindings to apply.
 * @param callback - A callback in which the bindings are applied.
 * @returns The returned value from the callback.
 */
export function withLogContext<T>(
  bindings: pino.Bindings,
  callback: (logger: pino.Logger) => MaybePromise<T>,
): MaybePromise<T> {
  const currentLogger = storage.getStore() ?? getLogger();
  const scopedLogger = currentLogger.child(bindings);

  return callback(scopedLogger);
}
