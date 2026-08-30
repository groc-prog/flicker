import dayjs from 'dayjs';
import {
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  InteractionContextType,
  LabelBuilder,
  Locale,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import { t } from 'i18next';
import * as z from 'zod';

import db from '@flicker/database';
import { BotTone, botToneEnum, MovieLanguage, movieLanguageEnum, timezoneEnum } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';

import { client } from '../..';
import { ServiceError } from '../../error';
import { getSupportedLocale, renderTemplate } from '../../i18n';
import { logger } from '../../telemetry/logging';
import { serializeModalCustomId } from '../../telemetry/tracing';

const GroupConfigurationValidator = z.object({
  timezone: z.enum(timezoneEnum.enumValues).optional(),
  languages: z.array(z.enum(MovieLanguage)).optional(),
  tone: z.enum(BotTone).optional(),
  channel: z.string(),
});

export const slashCommand = new SlashCommandBuilder()
  .setContexts(InteractionContextType.Guild)
  .setName(t('server.configure-server.name', { lng: Locale.EnglishUS }))
  .setNameLocalization(Locale.German, t('server.configure-server.name', { lng: Locale.German }))
  .setDescription(t('server.configure-server.description', { lng: Locale.EnglishUS }))
  .setDescriptionLocalization(Locale.German, t('server.configure-server.description', { lng: Locale.German }))
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const modalIds = {
  configureServer: 'configure-server',
};

export async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.info(`Getting current configuration for group ${interaction.guildId}`);
  const [group] = await db
    .select({
      timezone: groupsTable.timezone,
      languages: groupsTable.languages,
      tone: groupsTable.tone,
      discordChannelId: groupsTable.discordChannelId,
    })
    .from(groupsTable)
    .where(eq(groupsTable.discordId, interaction.guildId!));

  const timezoneTextInput = new TextInputBuilder()
    .setCustomId('configure-server-timezone')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(
      t('server.configure-server.modal.components.timezone.placeholder', {
        lng: getSupportedLocale(interaction.locale),
      }),
    );
  if (group?.timezone) timezoneTextInput.setValue(group.timezone);

  const languageStringSelect = new StringSelectMenuBuilder()
    .setCustomId('configure-server-languages')
    .setMinValues(1)
    .setMaxValues(movieLanguageEnum.enumValues.length);
  for (const language of movieLanguageEnum.enumValues) {
    const isConfigured = !!group?.languages?.find((configuredLanguage) => configuredLanguage === language);
    languageStringSelect.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          t(`server.configure-server.modal.components.languages.options.${language}`, {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setValue(language)
        .setDefault(isConfigured),
    );
  }

  const toneStringSelect = new StringSelectMenuBuilder()
    .setCustomId('configure-server-tone')
    .setMinValues(1)
    .setMaxValues(1);
  for (const tone of botToneEnum.enumValues) {
    toneStringSelect.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          t(`server.configure-server.modal.components.tone.options.${tone}`, {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setValue(tone)
        .setDefault(group?.tone === tone),
    );
  }

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('configure-server-channel')
    .setChannelTypes(ChannelType.GuildText);
  if (group?.discordChannelId) channelSelect.setDefaultChannels(group.discordChannelId);

  logger.info('Building response modal with group configuration and defaults');
  const modal = new ModalBuilder()
    .setCustomId(serializeModalCustomId(modalIds.configureServer))
    .setTitle(t('server.configure-server.modal.title', { lng: getSupportedLocale(interaction.locale) }))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(
          t('server.configure-server.modal.components.timezone.label', { lng: getSupportedLocale(interaction.locale) }),
        )
        .setDescription(
          t('server.configure-server.modal.components.timezone.description', {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setTextInputComponent(timezoneTextInput),
      new LabelBuilder()
        .setLabel(
          t('server.configure-server.modal.components.languages.label', {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setDescription(
          t('server.configure-server.modal.components.languages.description', {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setStringSelectMenuComponent(languageStringSelect),
      new LabelBuilder()
        .setLabel(
          t('server.configure-server.modal.components.tone.label', { lng: getSupportedLocale(interaction.locale) }),
        )
        .setDescription(
          t('server.configure-server.modal.components.tone.description', {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setStringSelectMenuComponent(toneStringSelect),
      new LabelBuilder()
        .setLabel(
          t('server.configure-server.modal.components.channel.label', { lng: getSupportedLocale(interaction.locale) }),
        )
        .setDescription(
          t('server.configure-server.modal.components.channel.description', {
            lng: getSupportedLocale(interaction.locale),
          }),
        )
        .setChannelSelectMenuComponent(channelSelect),
    );

  await interaction.showModal(modal);
}

export async function onModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [existingGroupConfiguration] = await db
    .select({ tone: groupsTable.tone })
    .from(groupsTable)
    .where(eq(groupsTable.discordId, interaction.guildId!));
  const botTone = existingGroupConfiguration?.tone ?? BotTone.Normal;

  logger.debug('Validating inputs from modal');
  const tone = interaction.fields.getStringSelectValues('configure-server-tone');
  const channel = interaction.fields.getSelectedChannels('configure-server-channel');

  const { success, error, data } = GroupConfigurationValidator.safeParse({
    timezone: interaction.fields.getTextInputValue('configure-server-timezone') ?? undefined,
    languages: interaction.fields.getStringSelectValues('configure-server-languages') ?? undefined,
    tone: tone.length === 1 ? tone[0] : undefined,
    channel: channel?.first()?.id,
  });
  if (!success) {
    logger.info(`Modal submission failed input validation for fields ${error.issues.keys()}`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: renderTemplate(`tone.${botTone}.server-configuration.validation-failed`, interaction.locale),
    });
    return;
  }

  logger.info('Updating group configuration');
  const [group] = await db
    .insert(groupsTable)
    .values({
      timezone: data.timezone,
      languages: data.languages,
      tone: data.tone,
      discordChannelId: data.channel,
      discordId: interaction.guildId!,
    })
    .onConflictDoUpdate({
      target: [groupsTable.discordId],
      set: {
        timezone: sql.raw(`excluded.${groupsTable.timezone.name}`),
        languages: sql.raw(`excluded.${groupsTable.languages.name}`),
        tone: sql.raw(`excluded.${groupsTable.tone.name}`),
        discordChannelId: sql.raw(`excluded.${groupsTable.discordChannelId.name}`),
      },
    })
    .returning({ id: groupsTable.id, createdAt: groupsTable.createdAt, tone: groupsTable.tone });

  if (!group) throw new ServiceError('Query did not return any result');

  if (dayjs(interaction.createdAt).isBefore(dayjs(group.createdAt)))
    logger.info(`Successfully created new group configuration ${group.id}`);
  else logger.info(`Successfully updated group configuration ${group.id}`);

  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: renderTemplate(`tone.${group.tone}.server-configuration.created-or-updated`, interaction.locale, {
      commandName: slashCommand.name_localizations?.[getSupportedLocale(interaction.locale)] ?? slashCommand.name,
      commandId: client.commands
        .keys()
        .find((commandId) => client.commands.get(commandId)?.slashCommand.name === slashCommand.name),
    }),
  });
}
