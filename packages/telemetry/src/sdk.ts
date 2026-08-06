import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { containerDetector } from '@opentelemetry/resource-detector-container';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { getLogger } from './logging';

/**
 * Initializes a new instance of the {@link NodeSDK} with all service defaults.
 *
 * By default, only {@link PinoInstrumentation} and {@link PgInstrumentation} will be added
 * as a instrumentation.
 * @param instrumentations - Additional instrumentations to apply.
 * @returns A SDK ready to be started.
 */
export function initializeSDK(instrumentations?: NodeSDKConfiguration['instrumentations']): NodeSDK {
  const logger = getLogger();
  const metricsExportInterval = Number(process.env.OTEL_COLLECTOR_METRICS_EXPORT_INTERVAL);

  if (!process.env.OTEL_COLLECTOR_URL) logger.warn(`OTEL_COLLECTOR_URL is not defined, falling back to default`);
  if (isNaN(metricsExportInterval))
    logger.warn(`OTEL_COLLECTOR_METRICS_EXPORT_INTERVAL is not set set to a valid number, falling back to default`);

  logger.debug('Initializing OpenTelemetry SDK');
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION,
    }),
    resourceDetectors: [containerDetector],
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: process.env.OTEL_COLLECTOR_URL,
        }),
      ),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: 'http://localhost:4317',
        }),
        exportIntervalMillis: isNaN(metricsExportInterval) ? undefined : metricsExportInterval,
      }),
    ],
    instrumentations: [
      ...(instrumentations ?? []),
      new PgInstrumentation(),
      new PinoInstrumentation({
        logKeys: {
          traceId: 'myTraceId',
          spanId: 'mySpanId',
          traceFlags: 'myTraceFlags',
        },
        disableLogSending: true,
      }),
    ],
  });

  process.once('beforeExit', async () => {
    try {
      logger.info('Shutting down OpenTelemetry SDK');
      await sdk.shutdown();
    } catch (err) {
      logger.error(err, `Error while shutting down OpenTelemetry SDK: ${(err as Error).message}`);
    }
  });

  return sdk;
}
