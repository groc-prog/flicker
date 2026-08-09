declare module 'bun' {
  interface Env {
    BUNQUEUE_DATA_PATH: string;
    JOB_CINEMA_DATA_SCRAPING_SCHEDULE?: string;
    TMDB_API_TOKEN?: string;
  }
}
