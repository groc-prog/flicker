import dayjs from 'dayjs';
import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { t } from 'i18next';
import * as z from 'zod';

import db from '@flicker/database';
import { BotTone } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';

import { client } from '../..';
import { getSupportedLocale, renderTemplate } from '../../i18n';
import { logger } from '../../telemetry/logging';
import { ServiceError } from '../../utils/error';

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

  const notificationId = interaction.options.getString(t('server.notification-delete.options.notification.name'), true);

  const { success } = z.uuid().safeParse(notificationId);
  if (!success) {
    logger.info(`Provided notification ID ${notificationId} is not a valid ID`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.notification-delete.not-found`, interaction.locale),
    });
    return;
  }

  logger.info(`Soft-deleting notification ${notificationId}`);
  const [notification] = await db
    .update(notificationsTable)
    .set({
      deletedAt: dayjs.utc().toDate(),
    })
    .where(eq(notificationsTable.id, notificationId))
    .returning({ id: notificationsTable.id, name: notificationsTable.name });

  if (!notification) {
    logger.info(`Provided notification ID ${notificationId} not found`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.notification-delete.not-found`, interaction.locale),
    });
    return;
  }

  logger.info(`Successfully soft deleted notification ${notification.id} for group ${group.id}`);
  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: renderTemplate(`tone.${botTone}.notification-delete.soft-deleted`, interaction.locale, {
      name: notification.name,
      commandName: `${t('server.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-command-group.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.notification-restore.name', { lng: getSupportedLocale(interaction.locale) })}`,
      commandId: client.commandIds.get(t('server.name')),
    }),
  });
}

export async function onAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const search = interaction.options.getString(t('server.notification-delete.options.notification.name'));

  logger.debug(`Fuzzy searching notifications for group ${interaction.guildId} matching search term ${search}`);

  const query = db
    .select({ name: notificationsTable.name, value: notificationsTable.id })
    .from(notificationsTable)
    .leftJoin(groupsTable, eq(notificationsTable.groupId, groupsTable.id))
    .where(and(eq(groupsTable.discordId, interaction.guildId!), isNull(notificationsTable.deletedAt)));

  const trimmedSearch = search?.trim();
  if (trimmedSearch && trimmedSearch.length !== 0) {
    query.orderBy(desc(sql`similarity(${notificationsTable.name}, ${trimmedSearch})`));
  } else {
    query.orderBy(asc(notificationsTable.name));
  }

  const matches = await query.limit(25);
  await interaction.respond(matches);
}
