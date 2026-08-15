import { Worker, type Job } from 'bunqueue/client';

/**
 * Waits for a job with a matching `jobId` to complete successfully. If the job fails, the
 * test will fail automatically.
 * @param worker - The worker which processes the job.
 * @param jobId - The job ID to wait for.
 */
export async function waitForJobCompletion<T>(worker: Worker<T>, jobId: Job['id']): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.on('completed', (job) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      resolve();
    });

    worker.on('failed', (job, error) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      reject(new Error(`Job ${job.id} failed prematurely: ${error.message}`));
    });
  });
}

/**
 * Waits for a job with a matching `jobId` to fail. If the job succeeds, the
 * test will fail automatically.
 * @param worker - The worker which processes the job.
 * @param jobId - The job ID to wait for.
 * @returns A promise which resolves to the error the job has thrown.
 */
export async function waitForJobFailure<T>(worker: Worker<T>, jobId: Job['id']): Promise<Error> {
  return new Promise((resolve, reject) => {
    worker.on('completed', (job) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      reject(new Error(`Job ${job.id} succeeded unexpectedly`));
    });

    worker.on('failed', (job, error) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      resolve(error);
    });
  });
}

/**
 * Builds a HTML body response with provided data inserted at the position which would usually
 * contain the actual data in a real response.
 * @param json - The JSON to embed into the HTML.
 * @returns A `Response` object containing the embedded JSON inside the HTML content.
 */
export function getScrapedDataResponse(json: object): Response {
  return new Response(
    `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <script id="pmkino-frontpage-script-js-extra">var someVar='${JSON.stringify(json)}'</script>
      </head>
      <body>
      </body>
      </html>
    `,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    },
  );
}
