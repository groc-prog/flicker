import { InteractionContextType, Locale, SlashCommandBuilder, type CommandGroupDefinition } from 'discord.js';
import { t } from 'i18next';

import { NotificationRecurrencePattern } from '@flicker/database/schemas/enums';

import * as configureServerCommand from './configure-server';
import * as notificationCreateCommand from './notification-create';
import * as notificationDeleteCommand from './notification-delete';
import * as notificationUpdateCommand from './notification-update';

export const command = new SlashCommandBuilder()
  .setName(t('server.name'))
  .setNameLocalization(Locale.German, t('server.name', { lng: Locale.German }))
  .setDescription(t('server.description'))
  .setDescriptionLocalization(Locale.German, t('server.description', { lng: Locale.German }))
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName(t('server.configure-server.name'))
      .setNameLocalization(Locale.German, t('server.configure-server.name', { lng: Locale.German }))
      .setDescription(t('server.configure-server.description'))
      .setDescriptionLocalization(Locale.German, t('server.configure-server.description', { lng: Locale.German })),
  )
  .addSubcommandGroup((subcommandGroup) =>
    subcommandGroup
      .setName(t('server.notification-command-group.name'))
      .setNameLocalization(Locale.German, t('server.notification-command-group.name', { lng: Locale.German }))
      .setDescription(t('server.notification-command-group.description'))
      .setDescriptionLocalization(
        Locale.German,
        t('server.notification-command-group.description', { lng: Locale.German }),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(t('server.notification-create.name'))
          .setNameLocalization(Locale.German, t('server.notification-create.name', { lng: Locale.German }))
          .setDescription(t('server.notification-create.description'))
          .setDescriptionLocalization(
            Locale.German,
            t('server.notification-create.description', { lng: Locale.German }),
          )
          .addStringOption((option) =>
            option
              .setName(t('server.notification-create.options.name.name'))
              .setNameLocalization(
                Locale.German,
                t('server.notification-create.options.name.name', { lng: Locale.German }),
              )
              .setDescription(t('server.notification-create.options.name.description'))
              .setDescriptionLocalization(
                Locale.German,
                t('server.notification-create.options.name.description', { lng: Locale.German }),
              )
              .setRequired(true)
              .setMaxLength(255),
          )
          .addStringOption((option) =>
            option
              .setName(t('server.notification-create.options.search-term.name'))
              .setNameLocalization(
                Locale.German,
                t('server.notification-create.options.search-term.name', { lng: Locale.German }),
              )
              .setDescription(t('server.notification-create.options.search-term.description'))
              .setDescriptionLocalization(
                Locale.German,
                t('server.notification-create.options.search-term.description', { lng: Locale.German }),
              )
              .setRequired(true)
              .setMaxLength(255),
          )
          .addStringOption((option) =>
            option
              .setName(t('server.notification-create.options.recurrence-pattern.name'))
              .setNameLocalization(
                Locale.German,
                t('server.notification-create.options.recurrence-pattern.name', { lng: Locale.German }),
              )
              .setDescription(t('server.notification-create.options.recurrence-pattern.description'))
              .setDescriptionLocalization(
                Locale.German,
                t('server.notification-create.options.recurrence-pattern.description', { lng: Locale.German }),
              )
              .setChoices(
                {
                  name: t('server.notification-create.options.recurrence-pattern.options.hourly'),
                  name_localizations: {
                    [Locale.German]: t('server.notification-create.options.recurrence-pattern.options.hourly', {
                      lng: Locale.German,
                    }),
                  },
                  value: NotificationRecurrencePattern.Hourly,
                },
                {
                  name: t('server.notification-create.options.recurrence-pattern.options.daily'),
                  name_localizations: {
                    [Locale.German]: t('server.notification-create.options.recurrence-pattern.options.daily', {
                      lng: Locale.German,
                    }),
                  },
                  value: NotificationRecurrencePattern.Daily,
                },
                {
                  name: t('server.notification-create.options.recurrence-pattern.options.weekly'),
                  name_localizations: {
                    [Locale.German]: t('server.notification-create.options.recurrence-pattern.options.weekly', {
                      lng: Locale.German,
                    }),
                  },
                  value: NotificationRecurrencePattern.Weekly,
                },
              ),
          )
          .addIntegerOption((option) =>
            option
              .setName(t('server.notification-create.options.recurrence-interval.name'))
              .setNameLocalization(
                Locale.German,
                t('server.notification-create.options.recurrence-interval.name', { lng: Locale.German }),
              )
              .setDescription(t('server.notification-create.options.recurrence-interval.description'))
              .setDescriptionLocalization(
                Locale.German,
                t('server.notification-create.options.recurrence-interval.description', { lng: Locale.German }),
              )
              .setMinValue(1),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(t('server.notification-delete.name'))
          .setNameLocalization(Locale.German, t('server.notification-delete.name', { lng: Locale.German }))
          .setDescription(t('server.notification-delete.description'))
          .setDescriptionLocalization(
            Locale.German,
            t('server.notification-delete.description', { lng: Locale.German }),
          )
          .addStringOption((option) =>
            option
              .setName(t('server.notification-delete.options.notification.name'))
              .setNameLocalization(
                Locale.German,
                t('server.notification-delete.options.notification.name', { lng: Locale.German }),
              )
              .setDescription(t('server.notification-delete.options.notification.description'))
              .setDescriptionLocalization(
                Locale.German,
                t('server.notification-delete.options.notification.description', { lng: Locale.German }),
              )
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(t('server.notification-update.name'))
          .setNameLocalization(Locale.German, t('server.notification-update.name', { lng: Locale.German }))
          .setDescription(t('server.notification-update.description'))
          .setDescriptionLocalization(
            Locale.German,
            t('server.notification-update.description', { lng: Locale.German }),
          ),
      ),
  );

export const map: CommandGroupDefinition['map'] = {
  [`${t('server.name')}:${t('server.configure-server.name')}`]: configureServerCommand,
  [`${t('server.name')}:${t('server.notification-command-group.name')}:${t('server.notification-create.name')}`]:
    notificationCreateCommand,
  [`${t('server.name')}:${t('server.notification-command-group.name')}:${t('server.notification-update.name')}`]:
    notificationUpdateCommand,
  [`${t('server.name')}:${t('server.notification-command-group.name')}:${t('server.notification-delete.name')}`]:
    notificationDeleteCommand,
};
