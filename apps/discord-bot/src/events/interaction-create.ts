import { propagation, ROOT_CONTEXT, SpanStatusCode } from '@opentelemetry/api';
import dayjs from 'dayjs';
import {
  ChatInputCommandInteraction,
  Events,
  MessageFlags,
  ModalSubmitInteraction,
  type Interaction,
} from 'discord.js';
import { t } from 'i18next';

import db from '@flicker/database';
import { usersTable } from '@flicker/database/schemas/users';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { client } from '..';
import { ServiceError } from '../error';
import { getSupportedLocale } from '../i18n';
import { logger } from '../telemetry/logging';
import { deserializeTraceParentFromCustomId, eventTracer } from '../telemetry/tracing';

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

  if (interaction.isCommand()) {
    ctx[TelemetryIdentifier.CommandName] = interaction.commandName;
    ctx[TelemetryIdentifier.CommandType] = interaction.commandType;
    ctx[TelemetryIdentifier.CommandId] = interaction.commandId;
  }

  return await withLogContext(ctx, async () => {
    if (interaction.isChatInputCommand()) await onChatInputCommand(interaction);
    if (interaction.isModalSubmit()) await onModalSubmit(interaction);
  });
}

async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await eventTracer.startActiveSpan(`slash_command /${interaction.commandName}`, async (span) => {
    try {
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
        logger.info(`User with Discord ID ${interaction.user.id} already exists, nothing to update`);
      else logger.info(`Created new user ${user.id}`);

      const command = client.commands.get(interaction.commandId);
      if (!command) {
        logger.info(`Received unknown command ID ${interaction.commandId}, skipping`);
        return;
      }

      await command.onChatInputCommand(interaction);
    } catch (error) {
      if (error instanceof ServiceError) {
        logger.error(error, 'Caught service error, replying with generic error response');
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

        const commandDefinition = client.commands.get(commandId);
        if (!commandDefinition) {
          logger.error(`No command found for mapped ID ${commandId}, skipping`);
          return;
        }

        if (!commandDefinition.onModalSubmit) {
          logger.error(`No modal function found for command ${commandId}, but registered via custom ID ${customId}`);
          process.exit(1);
        }

        await commandDefinition.onModalSubmit(interaction);
      } catch (error) {
        if (error instanceof ServiceError) {
          logger.error(error, 'Caught service error, replying with generic error response');
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
