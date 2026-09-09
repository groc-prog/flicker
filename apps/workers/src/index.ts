import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';

import startWorkers from './queues';

dayjs.extend(utcPlugin, timezonePlugin);

await startWorkers();
