import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import startWorkers from './queues';

dayjs.extend(utcPlugin);

await startWorkers();
