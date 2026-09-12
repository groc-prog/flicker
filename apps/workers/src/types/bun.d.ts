declare module 'bun' {
  interface Env {
    BUNQUEUE_DATA_PATH: string;
    JOB_SCRAPE_CINEMA_DATA_CRON?: string;
    JOB_COLLECT_GROUP_NOTIFICATION_FUZZY_MATCH_THRESHOLD?: string;
    TMDB_API_TOKEN?: string;
    DISCORD_BOT_TOKEN?: string;
  }
}
