import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type APIApplicationCommand,
  type SlashCommandDefinition,
} from 'discord.js';

import commands from './commands';
import events from './events';
import { initializeI18n } from './i18n';
import { logger } from './telemetry/logging';

if (!process.env.DISCORD_BOT_TOKEN) {
  logger.error('DISCORD_BOT_TOKEN not defined in environment');
  process.exit(1);
}
if (!process.env.DISCORD_APP_ID) {
  logger.error('DISCORD_APP_ID not defined in environment');
  process.exit(1);
}

await initializeI18n();

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});
client.commands = new Map<string, SlashCommandDefinition>();

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

logger.info(`Registering ${commands.length} commands with Discord API`);
let route: Parameters<typeof rest.put>[0];

if (process.env.NODE_ENV === 'development') {
  logger.warn(`Running in development mode. Commands will only be refreshed in development guild`);

  if (!process.env.DISCORD_DEVELOPMENT_GUILD_ID) {
    logger.error('DISCORD_DEVELOPMENT_GUILD_ID not defined in environment');
    process.exit(1);
  }

  route = Routes.applicationGuildCommands(process.env.DISCORD_APP_ID, process.env.DISCORD_DEVELOPMENT_GUILD_ID);
} else {
  route = Routes.applicationCommands(process.env.DISCORD_APP_ID);
}

const registeredCommands = (await rest.put(route, {
  body: commands.map((command) => command.data.toJSON()),
})) as APIApplicationCommand[];

logger.info(`Mapping command definitions for ${registeredCommands.length} commands returned by Discord API`);
for (const command of registeredCommands) {
  const matchingCommand = commands.find(({ data }) => data.name === command.name);
  if (!matchingCommand) {
    logger.error(`Can not find command definition for command ID ${command.id} returned by Discord API`);
    process.exit(1);
  }

  logger.debug(`Registered mapping for command ${command.name} (${command.id}) with client`);
  client.commands.set(command.id, matchingCommand);
}

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
