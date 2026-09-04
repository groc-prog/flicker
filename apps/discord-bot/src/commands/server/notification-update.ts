import { AutocompleteInteraction, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { and, asc, desc, eq, sql, type InferInsertModel } from 'drizzle-orm';
import { t } from 'i18next';
import z from 'zod';

import db from '@flicker/database';
import { BotTone, NotificationRecurrencePattern } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';

import { renderTemplate } from '../../i18n';
import { logger } from '../../telemetry/logging';
import { ServiceError } from '../../utils/error';

const UpdateNotificationValidator = z.object({
  name: z.string().trim().min(1).max(250).nullable(),
  key: z.string().trim().min(1).max(250).nullable(),
  recurrencePattern: z.enum(NotificationRecurrencePattern).nullable(),
  recurrenceInterval: z.int32().gte(0).nullable(),
});

export async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.info(`Getting current configuration for group with Discord ID ${interaction.guildId}`);
  const [group] = await db
    .select({
      id: groupsTable.id,
      tone: groupsTable.tone,
    })
    .from(groupsTable)
    .where(eq(groupsTable.discordId, interaction.guildId!));

  if (!group) throw new ServiceError(`No group with Discord ID ${interaction.guildId} found`);
  const botTone = group?.tone ?? BotTone.Normal;

  const notificationId = interaction.options.getString(t('server.notification-update.options.notification.name'), true);
  const name = interaction.options.getString(t('server.notification-update.options.name.name'), true);
  const searchTerm = interaction.options.getString(t('server.notification-update.options.search-term.name'), true);
  const recurrencePattern = interaction.options.getString(
    t('server.notification-update.options.recurrence-pattern.name'),
  );
  const recurrenceInterval = interaction.options.getInteger(
    t('server.notification-update.options.recurrence-interval.name'),
  );

  logger.debug('Validating notification ID');
  const { success: isValidUuid } = z.uuid().safeParse(notificationId);
  if (!isValidUuid) {
    logger.info(`Provided notification ID ${notificationId} is not a valid ID`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.notification.not-found`, interaction.locale),
    });
    return;
  }

  logger.debug('Validating notification properties');
  const { success, error, data } = UpdateNotificationValidator.safeParse({
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
      content: renderTemplate(`tone.${botTone}.notification.validation-failed`, interaction.locale),
    });
    return;
  }

  if (data.name !== null) {
    logger.debug('Name has been updated, checking for notifications with duplicate name');
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
        content: renderTemplate(`tone.${botTone}.notification.name-already-exists`, interaction.locale, {
          name: data.name,
        }),
      });
      return;
    }
  }

  logger.info(`Updating notification ${notificationId} for group ${group.id} with new values`);
  const fieldsToUpdate: Partial<InferInsertModel<typeof notificationsTable>> = {};
  if (data.name !== null) fieldsToUpdate.name = data.name;
  if (data.key !== null) fieldsToUpdate.key = data.key;
  if (data.recurrencePattern !== NotificationRecurrencePattern.Unchanged)
    fieldsToUpdate.recurrencePattern = data.recurrencePattern;
  if (data.recurrenceInterval !== 0) fieldsToUpdate.recurrenceInterval = data.recurrenceInterval;

  const [notification] = await db.update(notificationsTable).set(fieldsToUpdate).returning({
    name: notificationsTable.name,
    key: notificationsTable.key,
    recurrencePattern: notificationsTable.recurrencePattern,
    recurrenceInterval: notificationsTable.recurrenceInterval,
  });
  if (!notification) {
    logger.error('Query did not return a notification ID');
    throw new ServiceError(`No notification was update`);
  }

  logger.info(`Successfully updated notification ${notificationId} for group ${group.id}`);
  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: renderTemplate(`tone.${botTone}.notification-update.updated`, interaction.locale, {
      name: notification.name,
      key: notification.key,
      recurrencePattern: notification.recurrencePattern ?? '--',
      recurrenceInterval: notification.recurrenceInterval ?? '--',
    }),
  });
}

export async function onAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const search = interaction.options.getString(t('server.notification-update.options.notification.name'));

  logger.debug(`Fuzzy searching notifications for group ${interaction.guildId} matching search term ${search}`);
  const query = db
    .select({ name: notificationsTable.name, value: notificationsTable.id })
    .from(notificationsTable)
    .leftJoin(groupsTable, eq(notificationsTable.groupId, groupsTable.id))
    .where(eq(groupsTable.discordId, interaction.guildId!));

  const trimmedSearch = search?.trim();
  if (trimmedSearch && trimmedSearch.length !== 0) {
    query.orderBy(desc(sql`similarity(${notificationsTable.name}, ${trimmedSearch})`));
  } else {
    query.orderBy(asc(notificationsTable.name));
  }

  const matches = await query.limit(25);
  await interaction.respond(matches);
}
