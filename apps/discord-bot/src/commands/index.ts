import { Routes, type APIApplicationCommand, type Client, type CommandDefinition, type REST } from 'discord.js';

import { logger } from '../telemetry/logging';

const commands: CommandDefinition[] = [];

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
    body: commands.map(({ command }) => command.toJSON()),
  })) as APIApplicationCommand[];

  logger.info(`Registering ${registeredCommands.length} command IDs with client`);
  for (const command of registeredCommands) {
    logger.debug(`Registering command ID ${command.id} (${command.name}) with client`);
    const commandDefinition = commands.find((definition) => definition.command.name === command.name);
    if (!commandDefinition) {
      logger.error(`No command definition found for command name ${command.name} after registration`);
      process.exit(1);
    }

    client.commandIds.set(command.name, command.id);
    client.commands.set(command.name, commandDefinition);

    if (commandDefinition.modalCustomId && commandDefinition.onModalSubmit) {
      logger.debug(`Registering model ${commandDefinition.modalCustomId} (command ${command.name}) with client`);
      client.modals.set(commandDefinition.modalCustomId, commandDefinition);
    }
  }
}
