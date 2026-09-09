import { REST } from 'discord.js';

import { logger } from './telemetry/logging';

if (!process.env.DISCORD_BOT_TOKEN) {
  logger.error('DISCORD_BOT_TOKEN not defined in environment');
  process.exit(1);
}

export const restApi = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
