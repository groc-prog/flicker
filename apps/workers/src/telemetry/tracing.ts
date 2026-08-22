import { trace } from '@opentelemetry/api';

export const movieProcessingTracer = trace.getTracer(`worker.movie_processing`);
