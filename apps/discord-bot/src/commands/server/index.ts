import { InteractionContextType, Locale, SlashCommandBuilder, type CommandGroupDefinition } from 'discord.js';
import { t } from 'i18next';

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
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(t('server.notification-delete.name'))
          .setNameLocalization(Locale.German, t('server.notification-delete.name', { lng: Locale.German }))
          .setDescription(t('server.notification-delete.description'))
          .setDescriptionLocalization(
            Locale.German,
            t('server.notification-delete.description', { lng: Locale.German }),
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
