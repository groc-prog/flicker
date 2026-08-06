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

/**
 * Initializes a new instance of the {@link NodeSDK} with all service defaults.
 * By default, only {@link PinoInstrumentation} will be added as a instrumentation.
 * @param instrumentations - Additional instrumentations to apply.
 * @returns A SDK ready to be started.
 */
export function initializeSDK(instrumentations?: NodeSDKConfiguration['instrumentations']): NodeSDK {
  const metricsExportInterval = Number(process.env.OTEL_COLLECTOR_METRICS_EXPORT_INTERVAL);

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
    await sdk.shutdown();
  });

  return sdk;
}
