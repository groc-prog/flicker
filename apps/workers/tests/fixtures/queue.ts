import { Worker, type Job } from 'bunqueue/client';

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
      reject(new Error(`Job ${jobId} failed prematurely: ${error.message}`));
    });
  });
}

export async function waitForJobFailure<T>(worker: Worker<T>, jobId: Job['id']): Promise<Error> {
  return new Promise((resolve, reject) => {
    worker.on('completed', (job) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      reject(new Error(`Job ${jobId} succeeded unexpectedly`));
    });

    worker.on('failed', (job, error) => {
      if (job.id !== jobId) return;
      worker.removeAllListeners();
      resolve(error);
    });
  });
}

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
