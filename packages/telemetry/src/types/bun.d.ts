declare module 'bun' {
  interface Env {
    LOG_LEVEL?: string;
    SERVICE_NAME?: string;
    SERVICE_VERSION?: string;
    OTEL_COLLECTOR_URL?: string;
    OTEL_COLLECTOR_METRICS_EXPORT_INTERVAL?: string;
  }
}
