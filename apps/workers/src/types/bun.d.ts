declare module 'bun' {
  interface Env {
    BUNQUEUE_DATA_PATH: string;
    JOB_SCRAPE_CINEMA_DATA_CRON?: string;
    TMDB_API_TOKEN?: string;
  }
}
