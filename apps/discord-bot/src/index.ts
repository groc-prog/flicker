import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import { Client, GatewayIntentBits, REST } from 'discord.js';

import { registerCommands } from './commands';
import events from './events';
import { logger } from './telemetry/logging';

dayjs.extend(utcPlugin);

if (!process.env.DISCORD_BOT_TOKEN) {
  logger.error('DISCORD_BOT_TOKEN not defined in environment');
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});
client.commands = new Map();
client.modals = new Map();

logger.info(`Registering ${events.length} events`);
for (const event of events) {
  if (event.once) {
    logger.debug(`Registering one-time event ${event.type}`);
    client.once(event.type, event.execute);
  } else {
    logger.debug(`Registering event ${event.type}`);
    client.on(event.type, event.execute);
  }
}

await registerCommands(rest, client);

logger.info('Logging in with DISCORD_BOT_TOKEN');
await client.login(process.env.DISCORD_BOT_TOKEN);

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (error) => {
  logger.error(error, 'Unhandled rejected promise');
  shutdown('unhandledRejection', 1);
});

async function shutdown(signal: string, exitCode: number): Promise<void> {
  logger.info(`Shutdown signal ${signal} received. Starting graceful teardown`);

  try {
    if (client.isReady()) client.destroy();

    logger.info('Teardown completed successfully');
    process.exit(exitCode);
  } catch (error) {
    logger.error(error, 'Error during graceful teardown');
    process.exit(1);
  }
}
