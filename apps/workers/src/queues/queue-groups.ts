import { QueueGroup } from 'bunqueue/client';

export const movieProcessingQueueGroup = new QueueGroup('movie-processing');

export const notificationsQueueGroup = new QueueGroup('notifications');
