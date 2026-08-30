import { Routes, type APIApplicationCommand, type Client, type CommandDefinition, type REST } from 'discord.js';

import { logger } from '../telemetry/logging';
import * as configureServerCommand from './server/configure-server';

const commands: CommandDefinition[] = [configureServerCommand];

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
    body: commands.map((command) => command.slashCommand.toJSON()),
  })) as APIApplicationCommand[];

  logger.info(`Mapping command definitions for ${registeredCommands.length} commands returned by Discord API`);
  for (const command of registeredCommands) {
    const matchingCommand = commands.find(({ slashCommand: data }) => data.name === command.name);
    if (!matchingCommand) {
      logger.error(`Can not find command definition for command ID ${command.id} returned by Discord API`);
      process.exit(1);
    }

    logger.debug(`Registered mapping for command ${command.name} (${command.id}) with client`);
    client.commands.set(command.id, matchingCommand);

    if (matchingCommand.modalIds && matchingCommand.onModalSubmit) {
      logger.debug(`Mapping ${matchingCommand.modalIds.size} custom IDs to command ${command.id}`);
      for (const customId of Object.values(matchingCommand.modalIds)) {
        const existingMapping = client.modals.get(customId);
        if (existingMapping) {
          logger.error(
            `Duplicate modal custom ID ${customId} found. Custom ID is defined for commands ${existingMapping} and ${command.id}`,
          );
          process.exit(1);
        }

        client.modals.set(customId, command.id);
      }
    }
  }
}
