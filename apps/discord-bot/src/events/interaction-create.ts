import { propagation, ROOT_CONTEXT, SpanStatusCode } from '@opentelemetry/api';
import dayjs from 'dayjs';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Events,
  InteractionContextType,
  MessageFlags,
  ModalSubmitInteraction,
  type Interaction,
} from 'discord.js';
import { t } from 'i18next';

import db from '@flicker/database';
import { groupsTable } from '@flicker/database/schemas/groups';
import { usersTable } from '@flicker/database/schemas/users';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { client } from '..';
import { getSupportedLocale } from '../i18n';
import { logger } from '../telemetry/logging';
import { deserializeTraceParentFromCustomId, eventTracer } from '../telemetry/tracing';
import { ServiceError } from '../utils/error';

export const once = false;
export const type = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  const ctx: Partial<Record<TelemetryIdentifier, unknown>> = {
    [TelemetryIdentifier.DiscordGuildId]: interaction.guildId,
    [TelemetryIdentifier.DiscordUserId]: interaction.user.id,
  };

  if (interaction.isModalSubmit()) {
    ctx[TelemetryIdentifier.ModalId] = interaction.customId;
  }

  if (interaction.isCommand() || interaction.isAutocomplete()) {
    ctx[TelemetryIdentifier.CommandName] = interaction.commandName;
    ctx[TelemetryIdentifier.CommandType] = interaction.commandType;
    ctx[TelemetryIdentifier.CommandId] = interaction.commandId;
  }

  if (interaction.isChatInputCommand()) {
    ctx[TelemetryIdentifier.SubcommandName] = interaction.options.getSubcommand() ?? undefined;
    ctx[TelemetryIdentifier.SubcommandGroupName] = interaction.options.getSubcommandGroup() ?? undefined;
  }

  return await withLogContext(ctx, async () => {
    if (interaction.isChatInputCommand()) await onChatInputCommand(interaction);
    if (interaction.isModalSubmit()) await onModalSubmit(interaction);
    if (interaction.isAutocomplete()) await onAutocomplete(interaction);
  });
}

async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await eventTracer.startActiveSpan(`slash_command /${interaction.commandName}`, async (span) => {
    try {
      const subcommandGroupName = interaction.options.getSubcommandGroup();
      const subcommandName = interaction.options.getSubcommand();
      const commandName = interaction.commandName;

      let commandKey = commandName;
      if (subcommandGroupName) commandKey = `${commandKey}:${subcommandGroupName}`;
      if (subcommandName) commandKey = `${commandKey}:${subcommandName}`;

      const command = client.commands.get(commandKey);
      if (!command) {
        logger.info(`Received unknown command with computed key ${commandKey}, skipping`);
        return;
      }

      logger.debug(`Received chat input command interaction ${interaction.id}`);
      const now = dayjs.utc();

      logger.info(`Ensuring user with Discord ID ${interaction.user.id} exists`);
      const [user] = await db
        .insert(usersTable)
        .values({
          discordId: interaction.user.id,
        })
        .onConflictDoUpdate({
          target: usersTable.discordId,
          set: {
            discordId: interaction.user.id,
          },
        })
        .returning({ id: usersTable.id, createdAt: usersTable.createdAt });

      if (!user) {
        logger.error('Query did not return a user ID');
        throw new ServiceError(`No user with matching Discord ID ${interaction.user.id} created or found`);
      }

      if (now.isAfter(user.createdAt))
        logger.debug(`User with Discord ID ${interaction.user.id} already exists, nothing to update`);
      else logger.info(`Created new user ${user.id}`);

      if (interaction.context === InteractionContextType.Guild) {
        logger.info(`Ensuring group with Discord ID ${interaction.guildId} exists`);
        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: interaction.guildId!,
          })
          .onConflictDoUpdate({
            target: groupsTable.discordId,
            set: {
              discordId: interaction.guildId!,
            },
          })
          .returning({ id: groupsTable.id, createdAt: groupsTable.createdAt });

        if (!group) {
          logger.error('Query did not return a group ID');
          throw new ServiceError(`No group with matching Discord ID ${interaction.guildId} created or found`);
        }

        if (now.isAfter(group.createdAt))
          logger.debug(`Group with Discord ID ${interaction.guildId} already exists, nothing to update`);
        else logger.info(`Created new group ${group.id}`);
      }

      await command.onChatInputCommand(interaction);
    } catch (error) {
      if (error instanceof ServiceError) {
        logger.info('Caught service error, replying with generic error response');
        if (interaction.replied) {
          logger.info('Interaction is already replied, skipping error response');
          return;
        }

        try {
          await interaction.reply({
            content: t('common.error', { lng: getSupportedLocale(interaction.locale) }),
            flags: [MessageFlags.Ephemeral],
          });
        } catch (error) {
          logger.error(error, 'Fallback response failed');
        }
        return;
      }

      logger.error(error, `Command ${interaction.id} in event ${type} failed to complete`);

      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
      });
    } finally {
      span.end();
    }
  });
}

async function onModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [customId, traceParentId] = deserializeTraceParentFromCustomId(interaction.customId);

  await eventTracer.startActiveSpan(
    `modal_submit ${customId}`,
    {
      attributes: {
        [TelemetryIdentifier.ModalId]: customId,
      },
    },
    propagation.extract(ROOT_CONTEXT, { traceparent: traceParentId }),
    async (span) => {
      try {
        logger.debug(`Received modal submit interaction ${interaction.id}`);
        const commandId = client.modals.get(customId);
        if (!commandId) {
          logger.info(`Received unknown custom ID ${customId}, skipping`);
          return;
        }

        const command = client.commands.get(commandId);
        if (!command) {
          logger.error(`No command found for mapped ID ${commandId}, skipping`);
          return;
        }

        if (!command.onModalSubmit) {
          logger.error(`No modal function found for command ${commandId}, but registered via custom ID ${customId}`);
          process.exit(1);
        }

        await command.onModalSubmit(interaction);
      } catch (error) {
        if (error instanceof ServiceError) {
          logger.info('Caught service error, replying with generic error response');
          if (interaction.replied) {
            logger.info('Interaction is already replied, skipping error response');
            return;
          }

          try {
            await interaction.reply({
              content: t('common.error', { lng: getSupportedLocale(interaction.locale) }),
              flags: [MessageFlags.Ephemeral],
            });
          } catch (error) {
            logger.error(error, 'Fallback response failed');
          }
          return;
        }

        logger.error(error, `Command ${interaction.id} in event ${type} failed to complete`);

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });
      } finally {
        span.end();
      }
    },
  );
}

async function onAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await eventTracer.startActiveSpan(`autocomplete /${interaction.commandName}`, async (span) => {
    try {
      const subcommandGroupName = interaction.options.getSubcommandGroup();
      const subcommandName = interaction.options.getSubcommand();
      const commandName = interaction.commandName;

      let commandKey = commandName;
      if (subcommandGroupName) commandKey = `${commandKey}:${subcommandGroupName}`;
      if (subcommandName) commandKey = `${commandKey}:${subcommandName}`;

      const command = client.commands.get(commandKey);
      if (!command) {
        logger.info(`Received autocomplete for unknown command with computed key ${commandKey}, skipping`);
        return;
      }

      if (!command.onAutocomplete) {
        logger.error(`No autocomplete function found for command ${interaction.commandId}`);
        process.exit(1);
      }

      logger.debug(`Received autocomplete interaction ${interaction.id}`);
      await command.onAutocomplete(interaction);
    } catch (error) {
      if (error instanceof ServiceError) {
        logger.info('Caught service error, responding with empty response');
        if (interaction.responded) {
          logger.info('Interaction is already responded, skipping empty response');
          return;
        }

        try {
          await interaction.respond([]);
        } catch (error) {
          logger.error(error, 'Fallback response failed');
        }
        return;
      }

      logger.error(error, `Autocomplete for command ${interaction.id} in event ${type} failed to complete`);

      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
      });
    } finally {
      span.end();
    }
  });
}
