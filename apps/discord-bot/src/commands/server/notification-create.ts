import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { t } from 'i18next';
import * as z from 'zod';

import db from '@flicker/database';
import { BotTone, NotificationRecurrencePattern } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { usersTable } from '@flicker/database/schemas/users';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';

import { client } from '../..';
import { getSupportedLocale, renderTemplate } from '../../i18n';
import { logger } from '../../telemetry/logging';
import { ServiceError } from '../../utils/error';

const NotificationValidator = z.object({
  name: z.string().trim().min(1).max(250),
  key: z.string().trim().min(1).max(250),
  recurrencePattern: z.enum(NotificationRecurrencePattern).nullable(),
  recurrenceInterval: z.int32().positive().nullable(),
});

export async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.info(`Getting current configuration for group ${interaction.guildId}`);
  const [group] = await db
    .select({
      id: groupsTable.id,
      tone: groupsTable.tone,
    })
    .from(groupsTable)
    .where(eq(groupsTable.discordId, interaction.guildId!));

  if (!group) throw new ServiceError(`No group with Discord ID ${interaction.guildId} found`);
  const botTone = group?.tone ?? BotTone.Normal;

  const name = interaction.options.getString(t('server.notification-create.options.name.name'), true);
  const searchTerm = interaction.options.getString(t('server.notification-create.options.search-term.name'), true);
  const recurrencePattern = interaction.options.getString(
    t('server.notification-create.options.recurrence-pattern.name'),
  );
  const recurrenceInterval = interaction.options.getInteger(
    t('server.notification-create.options.recurrence-interval.name'),
  );

  const { success, error, data } = NotificationValidator.safeParse({
    name,
    key: searchTerm,
    recurrencePattern,
    recurrenceInterval,
  });
  if (!success) {
    logger.info(
      { [TelemetryIdentifier.ValidationErrors]: error.issues.values().toArray() },
      `User input failed validation for fields ${error.issues
        .values()
        .map((value) => value.path[0])
        .toArray()}`,
    );
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.notification-create.validation-failed`, interaction.locale),
    });
    return;
  }

  const [duplicateNotification] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.groupId, group.id), eq(notificationsTable.name, data.name)));
  if (duplicateNotification) {
    logger.info(
      `Notification with name ${data.name} (${duplicateNotification.id}) already exists for group ${group.id}`,
    );
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.notification-create.name-already-exists`, interaction.locale, {
        name: data.name,
      }),
    });
    return;
  }

  logger.info(`Getting ID for user with Discord ID ${interaction.user.id}`);
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.discordId, interaction.user.id));
  if (!user) {
    logger.error('User who initialized command not found');
    throw new ServiceError(`No user with matching Discord ID ${interaction.user.id} found`);
  }

  logger.info(`Creating new notification with name ${data.name} for group ${group.id}`);
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      isRecurring: !!data.recurrencePattern || !!data.recurrenceInterval,
      ...data,
      creatorId: user.id,
      groupId: group.id,
    })
    .returning({
      id: notificationsTable.id,
      name: notificationsTable.name,
      searchTerm: notificationsTable.key,
    });
  if (!notification) {
    logger.error('Query did not return a notification ID');
    throw new ServiceError(`No notification was created`);
  }

  logger.info(`Successfully created notification ${notification.id} for group ${group.id}`);
  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: renderTemplate(`tone.${botTone}.notification-create.created`, interaction.locale, {
      name: notification.name,
      searchTerm: notification.searchTerm,
      updateCommandName: `${t('server.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-command-group.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-update.name', { lng: getSupportedLocale(interaction.locale) })}`,
      deleteCommandName: `${t('server.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-command-group.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-delete.name', { lng: getSupportedLocale(interaction.locale) })}`,
      commandId: client.commandIds.get(t('server.name')),
    }),
  });
}
