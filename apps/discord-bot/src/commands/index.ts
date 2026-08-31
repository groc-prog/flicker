import {
  Routes,
  SharedSlashCommand,
  type APIApplicationCommand,
  type Client,
  type CommandGroupDefinition,
  type REST,
} from 'discord.js';

import { logger } from '../telemetry/logging';
import * as serverCommands from './server';

const commands: SharedSlashCommand[] = [serverCommands.command];
const commandMap: CommandGroupDefinition['map'] = {
  ...serverCommands.map,
};

/**
 * Registers slash commands with the client.
 *
 * When running in development mode, the commands will only be installed for the guild with
 * the defined `DISCORD_DEVELOPMENT_GUILD_ID`.
 * @param rest - The global {@link REST} instance.
 * @param client - The global {@link Client}.
 */
export async function registerCommands(rest: REST, client: Client): Promise<void> {
  if (!process.env.DISCORD_APP_ID) {
    logger.error('DISCORD_APP_ID not defined in environment');
    process.exit(1);
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
    body: commands.map((command) => command.toJSON()),
  })) as APIApplicationCommand[];

  logger.info(`Registering ${registeredCommands.length} command IDs with client`);
  for (const command of registeredCommands) {
    logger.debug(`Registering command ID ${command.id} (${command.name}) with client`);
    client.commandIds.set(command.name, command.id);
  }

  logger.info(`Mapping command definitions for ${Object.keys(commandMap).length} computed command keys`);
  for (const [computedKey, definition] of Object.entries(commandMap)) {
    logger.debug(`Registered mapping for computed command key ${computedKey} with client`);
    client.commands.set(computedKey, definition);

    if (definition.modalCustomId && definition.onModalSubmit) {
      logger.debug(`Mapping modal ${definition.modalCustomId} to computed command key ${computedKey}`);
      const existingMapping = client.modals.get(definition.modalCustomId);
      if (existingMapping) {
        logger.error(
          `Duplicate modal custom ID ${definition.modalCustomId} found. Custom ID is defined for computed command keys ${existingMapping} and ${computedKey}`,
        );
        process.exit(1);
      }

      client.modals.set(definition.modalCustomId, computedKey);
    }
  }
}
