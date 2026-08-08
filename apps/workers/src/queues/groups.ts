import { QueueGroup } from 'bunqueue/client';

export const movieProcessingQueueGroup = new QueueGroup('movie-processing');

export const tmdbMetadataQueue = movieProcessingQueueGroup.getQueue('tmdb-metadata', {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});
export const tmdbTranslationQueue = movieProcessingQueueGroup.getQueue('tmdb-translation', {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});
