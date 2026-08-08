import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
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
 * By default, only {@link PgInstrumentation} will be added
 * as a instrumentation.
 * @param instrumentations - Additional instrumentations to apply.
 */
export function initializeSDK(instrumentations?: NodeSDKConfiguration['instrumentations']): void {
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
    instrumentations: [...(instrumentations ?? []), new PgInstrumentation()],
  });

  sdk.start();
  logger.info('OpenTelemetry SDK initialized');

  process.once('beforeExit', async () => {
    try {
      logger.info('Shutting down OpenTelemetry SDK');
      await sdk.shutdown();
    } catch (error) {
      logger.error(error, 'Failed to gracefully shut down OpenTelemetry SDK');
    }
  });
}
