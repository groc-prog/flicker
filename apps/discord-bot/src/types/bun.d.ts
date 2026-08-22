declare module 'bun' {
  interface Env {
    DISCORD_BOT_TOKEN?: string;
    DISCORD_APP_ID?: string;
    DISCORD_DEVELOPMENT_GUILD_ID?: string;
  }
}
