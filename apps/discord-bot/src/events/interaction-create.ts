import { SpanStatusCode } from '@opentelemetry/api';
import { ChatInputCommandInteraction, Events, type Interaction } from 'discord.js';

import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { client } from '..';
import { logger } from '../telemetry/logging';
import { eventTracer } from '../telemetry/tracing';

export const once = false;
export const type = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  const ctx: Partial<Record<TelemetryIdentifier, unknown>> = {
    [TelemetryIdentifier.InteractionGuildId]: interaction.guildId,
    [TelemetryIdentifier.InteractionUserId]: interaction.user.id,
  };

  if (interaction.isCommand()) {
    ctx[TelemetryIdentifier.CommandName] = interaction.commandName;
    ctx[TelemetryIdentifier.CommandType] = interaction.commandType;
    ctx[TelemetryIdentifier.CommandId] = interaction.commandId;
  }

  return await withLogContext(ctx, async () => {
    if (interaction.isChatInputCommand()) await onChatInputCommand(interaction);
  });
}

async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await eventTracer.startActiveSpan(`slash_command /${interaction.commandName}`, async (span) => {
    try {
      logger.debug(`Received chat input command interaction ${interaction.id}`);

      const command = client.commands.get(interaction.commandId);
      if (!command) {
        logger.info(`Received unknown command ID ${interaction.commandId}, skipping`);
        return;
      }

      await command.execute(interaction);
    } catch (error) {
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
