import { ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { and, eq, type InferSelectModel } from 'drizzle-orm';
import { t } from 'i18next';
import z from 'zod';

import db from '@flicker/database';
import {
  BotTone,
  KNOWN_GENRES,
  MovieLanguage,
  NotificationRecurrencePattern,
  notificationRecurrencePatternEnum,
} from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { renderTemplate } from '@flicker/i18n/utils';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';

import { getSupportedLocale } from '../../i18n/utils';
import { logger } from '../../telemetry/logging';
import { ServiceError } from '../../utils/error';

export const command = new SlashCommandBuilder()
  .setName(t('command.notification-create.name'))
  .setNameLocalization(MovieLanguage.German, t('command.notification-create.name', { lng: MovieLanguage.German }))
  .setDescription(t('command.notification-create.description'))
  .setDescriptionLocalization(
    MovieLanguage.German,
    t('command.notification-create.description', { lng: MovieLanguage.German }),
  )
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName(t('command.notification-create.option.name.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.name.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.name.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.name.description', { lng: MovieLanguage.German }),
      )
      .setMinLength(1)
      .setMaxLength(250)
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName(t('command.notification-create.option.ensure-performances-available.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.ensure-performances-available.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.ensure-performances-available.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.ensure-performances-available.description', {
          lng: MovieLanguage.German,
        }),
      ),
  )
  .addStringOption((option) =>
    option
      .setName(t('command.notification-create.option.search-key.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.search-key.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.search-key.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.search-key.description', { lng: MovieLanguage.German }),
      )
      .setMinLength(1)
      .setMaxLength(250),
  )
  .addStringOption((option) =>
    option
      .setName(t('command.notification-create.option.genre.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.genre.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.genre.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.genre.description', { lng: MovieLanguage.German }),
      )
      .addChoices(
        KNOWN_GENRES.map((genre) => ({
          value: genre,
          name: t(`enum.genre.${genre}`),
          name_localizations: {
            [MovieLanguage.German]: t(`enum.genre.${genre}`, { lng: MovieLanguage.German }),
          },
        })),
      )
      .setMinLength(0)
      .setMaxLength(KNOWN_GENRES.length),
  )
  .addNumberOption((option) =>
    option
      .setName(t('command.notification-create.option.min-vote-average.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.min-vote-average.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.min-vote-average.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.min-vote-average.description', { lng: MovieLanguage.German }),
      )
      .setMinValue(0)
      .setMaxValue(10),
  )
  .addStringOption((option) =>
    option
      .setName(t('command.notification-create.option.recurrence-pattern.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.recurrence-pattern.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.recurrence-pattern.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.recurrence-pattern.description', { lng: MovieLanguage.German }),
      )
      .addChoices(
        notificationRecurrencePatternEnum.enumValues.map((genre) => ({
          value: genre,
          name: t(`enum.recurrence-pattern.${genre}`),
          name_localizations: {
            [MovieLanguage.German]: t(`enum.recurrence-pattern.${genre}`, { lng: MovieLanguage.German }),
          },
        })),
      )
      .setMinLength(0)
      .setMaxLength(KNOWN_GENRES.length),
  )
  .addIntegerOption((option) =>
    option
      .setName(t('command.notification-create.option.recurrence-interval.name'))
      .setNameLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.recurrence-interval.name', { lng: MovieLanguage.German }),
      )
      .setDescription(t('command.notification-create.option.recurrence-interval.description'))
      .setDescriptionLocalization(
        MovieLanguage.German,
        t('command.notification-create.option.recurrence-interval.description', { lng: MovieLanguage.German }),
      )
      .setMinValue(1),
  );

export const modalCustomId = 'notification-create';

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

  const name = interaction.options.getString(t('command.notification-create.option.name.name'), true);
  const ensurePerformancesAvailable = interaction.options.getBoolean(
    t('command.notification-create.option.ensure-performances-available.name'),
  );
  const searchKey = interaction.options.getString(t('command.notification-create.option.search-key.name'));
  const genre = interaction.options.getString(t('command.notification-create.option.genre.name'));
  const minVoteAverage = interaction.options.getNumber(t('command.notification-create.option.min-vote-average.name'));
  const recurrencePattern = interaction.options.getString(
    t('command.notification-create.option.recurrence-pattern.name'),
  );
  const recurrenceInterval = interaction.options.getInteger(
    t('command.notification-create.option.recurrence-interval.name'),
  );

  logger.debug('Validating notification properties');
  const { success, error, data } = await createNotificationValidator(group.id).safeParseAsync({
    name,
    searchKey,
    ensurePerformancesAvailable,
    genre,
    minVoteAverage,
    recurrenceInterval,
    recurrencePattern,
  });
  if (!success) {
    logger.info(
      { [TelemetryIdentifier.ValidationErrors]: error.issues.values().toArray() },
      `User input failed validation for fields ${error.issues
        .values()
        .map((value) => value.path[0])
        .toArray()}`,
    );

    const validationIssues = error.issues.map(({ message }) =>
      renderTemplate(message, getSupportedLocale(interaction.locale), {
        name,
        recurrencePatterns: notificationRecurrencePatternEnum.enumValues.map((pattern) =>
          t(`enum.recurrence-pattern.${pattern}`, { lng: interaction.locale }),
        ),
      }),
    );
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(
        'validation.notification-create.validation-failure',
        getSupportedLocale(interaction.locale),
        {
          issues: validationIssues,
        },
      ),
    });
    return;
  }

  logger.info(`Creating new notification with name ${data.name} for group ${group.id}`);
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      ...data,
      groupId: group.id,
    })
    .returning({
      id: notificationsTable.id,
      name: notificationsTable.name,
    });
  if (!notification) {
    logger.error('Query did not return a notification ID');
    throw new ServiceError(`No notification was created`);
  }

  logger.info(`Successfully created notification ${notification.id} for group ${group.id}`);
  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: renderTemplate(`tone.${botTone}.notification-create.success`, getSupportedLocale(interaction.locale), {
      name: notification.name,
    }),
  });
}

function createNotificationValidator(groupId: InferSelectModel<typeof groupsTable>['id']) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { error: 'validation.notification-create.name' })
        .max(250, { error: 'validation.notification-create.name' })
        .refine(
          async (name) => {
            logger.debug('Checking for notifications with duplicate name');
            const [duplicateNotification] = await db
              .select({ id: notificationsTable.id })
              .from(notificationsTable)
              .where(and(eq(notificationsTable.groupId, groupId), eq(notificationsTable.name, name)));

            return duplicateNotification === null;
          },
          { error: 'validation.notification-create.duplicate-name' },
        ),
      ensurePerformancesAvailable: z.boolean().nullable().default(true),
      searchKey: z
        .string()
        .trim()
        .min(1, { error: 'validation.notification-create.search-key' })
        .max(250, { error: 'validation.notification-create.search-key' })
        .nullable(),
      genre: z.enum(KNOWN_GENRES, { error: 'validation.notification-create.genre' }).nullable(),
      minVoteAverage: z
        .number()
        .gte(0, { error: 'validation.notification-create.min-vote-average' })
        .lte(10, { error: 'validation.notification-create.min-vote-average' })
        .nullable(),
      recurrencePattern: z
        .enum(NotificationRecurrencePattern, { error: 'validation.notification-create.recurrence-pattern' })
        .nullable(),
      recurrenceInterval: z.int().gt(0, { error: 'validation.notification-create.recurrence-interval' }).nullable(),
    })
    .superRefine((data, ctx) => {
      if (!data.searchKey && !data.genre && !data.minVoteAverage)
        ctx.addIssue({
          code: 'custom',
          message: 'validation.notification-create.filter-required',
        });
    });
}
