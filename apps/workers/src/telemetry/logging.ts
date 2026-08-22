import type { Worker } from 'bunqueue/client';
import dayjs from 'dayjs';

import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { getLogger } from '@flicker/telemetry/logging';

import 'dayjs/plugin/utc';

export const logger = getLogger();

/**
 * Attaches all relevant events to the provided worker and logs them accordingly.
 * @param worker - The worker to attach event logging to.
 */
export function attachWorkerEventLogging<T, R>(worker: Worker<T, R>): void {
  worker.on('ready', () => {
    logger.info(
      { [TelemetryIdentifier.WorkerEvent]: 'ready', [TelemetryIdentifier.WorkerName]: worker.name },
      'Worker initialized and started polling for jobs',
    );
  });
  worker.on('active', (job) => {
    logger.info(
      {
        [TelemetryIdentifier.WorkerEvent]: 'active',
        [TelemetryIdentifier.WorkerJobId]: job.id,
        [TelemetryIdentifier.WorkerJobName]: job.name,
        [TelemetryIdentifier.WorkerJobAttempt]: job.attemptsMade,
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      `Job ${job.id} [${job.name}] started processing`,
    );
  });
  worker.on('completed', (job) => {
    logger.info(
      {
        [TelemetryIdentifier.WorkerEvent]: 'completed',
        [TelemetryIdentifier.WorkerJobId]: job.id,
        [TelemetryIdentifier.WorkerJobName]: job.name,
        [TelemetryIdentifier.WorkerJobDuration]:
          job.finishedOn && job.processedOn ? dayjs.utc(job.finishedOn - job.processedOn).format() : null,
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      `Job ${job.id} [${job.name}] completed successfully`,
    );
  });
  worker.on('failed', (job, error) => {
    logger.error(
      {
        [TelemetryIdentifier.WorkerEvent]: 'failed',
        [TelemetryIdentifier.WorkerJobId]: job.id,
        [TelemetryIdentifier.WorkerJobName]: job.name,
        [TelemetryIdentifier.WorkerName]: worker.name,
        err: error,
      },
      `Job ${job.id} [${job.name}] failed: ${error.message}`,
    );
  });
  worker.on('progress', (job, progress) => {
    const jobId = job?.id ?? 'unknown';

    logger.debug(
      {
        [TelemetryIdentifier.WorkerEvent]: 'progress',
        [TelemetryIdentifier.WorkerJobId]: jobId,
        [TelemetryIdentifier.WorkerJobName]: job?.name,
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      `Job ${jobId} progress: ${progress}%`,
    );
  });
  worker.on('stalled', (jobId, reason) => {
    logger.warn(
      {
        [TelemetryIdentifier.WorkerEvent]: 'stalled',
        [TelemetryIdentifier.WorkerJobId]: jobId,
        [TelemetryIdentifier.WorkerJobReason]: jobId,
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      `Job ${jobId} stalled: ${reason}`,
    );
  });
  worker.on('drained', () => {
    logger.debug(
      {
        [TelemetryIdentifier.WorkerEvent]: 'drained',
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      'Queue is drained, no waiting jobs remaining',
    );
  });
  worker.on('error', (error) => {
    logger.error(
      {
        [TelemetryIdentifier.WorkerEvent]: 'error',
        [TelemetryIdentifier.WorkerName]: worker.name,
        err: error,
      },
      `Worker error encountered: ${error.message}`,
    );
  });
  worker.on('cancelled', ({ jobId, reason }) => {
    logger.warn(
      {
        [TelemetryIdentifier.WorkerEvent]: 'cancelled',
        [TelemetryIdentifier.WorkerJobId]: jobId,
        [TelemetryIdentifier.WorkerJobReason]: jobId,
        [TelemetryIdentifier.WorkerName]: worker.name,
      },
      `Job ${jobId} was cancelled: ${reason}`,
    );
  });
  worker.on('closed', () => {
    logger.info(
      { [TelemetryIdentifier.WorkerEvent]: 'closed', [TelemetryIdentifier.WorkerName]: worker.name },
      'Worker has shut down gracefully',
    );
  });
}
