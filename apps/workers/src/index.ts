import { shutdownManager } from 'bunqueue/client';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import { queue, worker } from './queues/cinema-data-scraping';

dayjs.extend(utcPlugin);

await queue.waitUntilReady();
await worker.waitUntilReady();

queue.add('test');

process.on('SIGINT', async () => {
  await worker.close();
  shutdownManager();
  process.exit(0);
});
