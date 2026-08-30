import { QueueGroup } from 'bunqueue/client';

export const movieProcessingGroup = new QueueGroup('movie-processing');
