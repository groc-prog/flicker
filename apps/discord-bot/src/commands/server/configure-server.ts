import dayjs from 'dayjs';
import {
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import { t } from 'i18next';
import * as z from 'zod';

import db from '@flicker/database';
import { BotTone, botToneEnum, MovieLanguage, movieLanguageEnum } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';

import { client } from '../..';
import { getSupportedLocale, renderTemplate } from '../../i18n';
import { logger } from '../../telemetry/logging';
import { serializeModalCustomId } from '../../telemetry/tracing';
import { ServiceError } from '../../utils/error';

const GroupConfigurationValidator = z.object({
  languages: z.array(z.enum(MovieLanguage)).optional(),
  tone: z.enum(BotTone).optional(),
  channel: z.string(),
});

export const modalCustomId = 'configure-server';

export async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.info(`Getting current configuration for group ${interaction.guildId}`);
  const [group] = await db
    .select({
      languages: groupsTable.languages,
      tone: groupsTable.tone,
      discordChannelId: groupsTable.discordChannelId,
    })
    .from(groupsTable)
    .where(eq(groupsTable.discordId, interaction.guildId!));
  const tone = group?.tone ?? BotTone.Normal;

  logger.info(`Ensuring user ${interaction.user.id} has required server permissions`);
  const member = await interaction.guild?.members.fetch({
    user: interaction.user.id,
  });

  if (!member) {
    logger.info(`User ${interaction.user.id} not found as member of guild ${interaction.guildId}`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: t(`tone.${tone}.server-configuration.missing-permission`, {
        lng: getSupportedLocale(interaction.locale),
      }),
    });
    return;
  }

  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    logger.info(`User ${interaction.user.id} is missing required permission to configure guild ${interaction.guildId}`);
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: t(`tone.${tone}.server-configuration.missing-permission`, {
        lng: getSupportedLocale(interaction.locale),
      }),
    });
    return;
  }

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
    .setCustomId(serializeModalCustomId(modalCustomId))
    .setTitle(t('server.configure-server.modal.title', { lng: getSupportedLocale(interaction.locale) }))
    .addLabelComponents(
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
    languages: interaction.fields.getStringSelectValues('configure-server-languages') ?? undefined,
    tone: tone.length === 1 ? tone[0] : undefined,
    channel: channel?.first()?.id,
  });
  if (!success) {
    logger.info(
      { [TelemetryIdentifier.ValidationErrors]: error.issues.values().toArray() },
      `Modal submission failed input validation for fields ${error.issues
        .values()
        .map((value) => value.path[0])
        .toArray()}`,
    );
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
      languages: data.languages,
      tone: data.tone,
      discordChannelId: data.channel,
      discordId: interaction.guildId!,
    })
    .onConflictDoUpdate({
      target: [groupsTable.discordId],
      set: {
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
      commandName: `${t('server.name', { lng: getSupportedLocale(interaction.locale) })} ${t('server.configure-server.name', { lng: getSupportedLocale(interaction.locale) })}`,
      commandId: client.commandIds.get(t('server.name')),
    }),
  });
}
