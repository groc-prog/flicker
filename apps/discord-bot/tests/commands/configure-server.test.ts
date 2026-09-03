import { describe, expect, it, type Mock } from 'bun:test';
import {
  ChatInputCommandInteraction,
  Collection,
  Locale,
  MessageFlags,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js';
import { eq } from 'drizzle-orm';

import db from '@flicker/database';
import { BotTone, MovieLanguage } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';

import { onChatInputCommand, onModalSubmit } from '../../src/commands/server/configure-server';
import { createMockedInteraction } from '../fixtures/interaction';
import { mockedTraceparent } from '../setup';

describe('configure-server command', () => {
  describe('onChatInputCommand', () => {
    describe('when user is missing required permission', () => {
      it('replies with a missing permission error if the user is not a member on the server', async () => {
        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          guild: {
            members: {
              fetch: () => null,
            },
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.server-configuration.missing-permission`,
        });
      });

      it('replies with a missing permission error if the user does not have the required permissions', async () => {
        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          guild: {
            members: {
              fetch: async () => ({
                permissions: {
                  has: () => false,
                },
              }),
            },
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.server-configuration.missing-permission`,
        });
      });

      it('replies with a missing permission error in the tone from the group configuration', async () => {
        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
            discordChannelId: '1469389781023588352',
            languages: [MovieLanguage.English],
            tone: BotTone.SuperHyped,
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          guild: {
            members: {
              fetch: async () => ({
                permissions: {
                  has: () => false,
                },
              }),
            },
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${group!.tone}.server-configuration.missing-permission`,
        });
      });
    });

    describe('when user has required permission', () => {
      it('replies with a modal with default group configuration options if group configuration does not exist yet', async () => {
        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          guild: {
            members: {
              fetch: () => ({
                permissions: {
                  has: () => true,
                },
              }),
            },
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.showModal).toHaveBeenCalledTimes(1);

        const args = (interaction.showModal as Mock<(...args: unknown[]) => unknown>).mock.calls[0]?.[0];
        expect(args).toBeObject();

        expect(args).toHaveProperty('data', {
          custom_id: `configure-server:${mockedTraceparent.value}`,
          title: 'server.configure-server.modal.title',
        });

        expect(args).toHaveProperty(
          'components.0.data.label',
          'server.configure-server.modal.components.languages.label',
        );
        expect(args).toHaveProperty(
          'components.0.data.description',
          'server.configure-server.modal.components.languages.description',
        );
        expect(args).toHaveProperty('components.0.data.type', 18);
        expect(args).toHaveProperty('components.0.data.component.data', {
          custom_id: 'configure-server-languages',
          min_values: 1,
          max_values: 2,
          type: 3,
        });
        expect(args).toHaveProperty('components.0.data.component.options.0.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.languages.options.de',
          value: 'de',
        });
        expect(args).toHaveProperty('components.0.data.component.options.1.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.languages.options.en',
          value: 'en',
        });

        expect(args).toHaveProperty('components.1.data.label', 'server.configure-server.modal.components.tone.label');
        expect(args).toHaveProperty(
          'components.1.data.description',
          'server.configure-server.modal.components.tone.description',
        );
        expect(args).toHaveProperty('components.1.data.type', 18);
        expect(args).toHaveProperty('components.1.data.component.data', {
          custom_id: 'configure-server-tone',
          min_values: 1,
          max_values: 1,
          type: 3,
        });
        expect(args).toHaveProperty('components.1.data.component.options.0.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.normal',
          value: 'normal',
        });
        expect(args).toHaveProperty('components.1.data.component.options.1.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.lewd',
          value: 'lewd',
        });
        expect(args).toHaveProperty('components.1.data.component.options.2.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.super_hyped',
          value: 'super_hyped',
        });

        expect(args).toHaveProperty(
          'components.2.data.label',
          'server.configure-server.modal.components.channel.label',
        );
        expect(args).toHaveProperty(
          'components.2.data.description',
          'server.configure-server.modal.components.channel.description',
        );
        expect(args).toHaveProperty('components.2.data.type', 18);
        expect(args).toHaveProperty('components.2.data.component.data', {
          custom_id: 'configure-server-channel',
          channel_types: [0],
          type: 8,
        });
      });

      it('replies with a modal with existing group configuration options', async () => {
        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
            discordChannelId: '1469389781023588352',
            languages: [MovieLanguage.German],
            tone: BotTone.Lewd,
          })
          .returning({
            discordId: groupsTable.discordId,
            discordChannelId: groupsTable.discordChannelId,
          });
        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          locale: Locale.EnglishUS,
          guild: {
            members: {
              fetch: () => ({
                permissions: {
                  has: () => true,
                },
              }),
            },
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.showModal).toHaveBeenCalledTimes(1);

        const args = (interaction.showModal as Mock<(...args: unknown[]) => unknown>).mock.calls[0]?.[0];
        expect(args).toBeObject();

        expect(args).toHaveProperty('data', {
          custom_id: `configure-server:${mockedTraceparent.value}`,
          title: 'server.configure-server.modal.title',
        });

        expect(args).toHaveProperty(
          'components.0.data.label',
          'server.configure-server.modal.components.languages.label',
        );
        expect(args).toHaveProperty(
          'components.0.data.description',
          'server.configure-server.modal.components.languages.description',
        );
        expect(args).toHaveProperty('components.0.data.type', 18);
        expect(args).toHaveProperty('components.0.data.component.data', {
          custom_id: 'configure-server-languages',
          min_values: 1,
          max_values: 2,
          type: 3,
        });
        expect(args).toHaveProperty('components.0.data.component.options.0.data', {
          default: true,
          emoji: undefined,
          label: 'server.configure-server.modal.components.languages.options.de',
          value: 'de',
        });
        expect(args).toHaveProperty('components.0.data.component.options.1.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.languages.options.en',
          value: 'en',
        });

        expect(args).toHaveProperty('components.1.data.label', 'server.configure-server.modal.components.tone.label');
        expect(args).toHaveProperty(
          'components.1.data.description',
          'server.configure-server.modal.components.tone.description',
        );
        expect(args).toHaveProperty('components.1.data.type', 18);
        expect(args).toHaveProperty('components.1.data.component.data', {
          custom_id: 'configure-server-tone',
          min_values: 1,
          max_values: 1,
          type: 3,
        });
        expect(args).toHaveProperty('components.1.data.component.options.0.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.normal',
          value: 'normal',
        });
        expect(args).toHaveProperty('components.1.data.component.options.1.data', {
          default: true,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.lewd',
          value: 'lewd',
        });
        expect(args).toHaveProperty('components.1.data.component.options.2.data', {
          default: false,
          emoji: undefined,
          label: 'server.configure-server.modal.components.tone.options.super_hyped',
          value: 'super_hyped',
        });

        expect(args).toHaveProperty(
          'components.2.data.label',
          'server.configure-server.modal.components.channel.label',
        );
        expect(args).toHaveProperty(
          'components.2.data.description',
          'server.configure-server.modal.components.channel.description',
        );
        expect(args).toHaveProperty('components.2.data.type', 18);
        expect(args).toHaveProperty('components.2.data.component.data', {
          custom_id: 'configure-server-channel',
          channel_types: [0],
          type: 8,
          default_values: [
            {
              type: 'channel',
              id: group?.discordChannelId,
            },
          ],
        });
      });
    });
  });

  describe('onModalSubmit', () => {
    describe('when validation fails', () => {
      it('replies with a error if languages validation fails', async () => {
        const interaction = createMockedInteraction(ModalSubmitInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          fields: {
            getStringSelectValues(customId: string) {
              if (customId === 'configure-server-tone') return [BotTone.Lewd] as readonly string[];
              if (customId === 'configure-server-languages') return ['other'];
              return [];
            },
            getTextInputValue() {
              return 'Europe/Vienna';
            },
            getSelectedChannels() {
              return new Collection([['1469389781023588352', { id: '1469389781023588352' } as TextChannel]]);
            },
          },
        });

        await onModalSubmit(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.server-configuration.validation-failed`,
        });
      });

      it('replies with a error if tone validation fails', async () => {
        const interaction = createMockedInteraction(ModalSubmitInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          fields: {
            getStringSelectValues(customId: string) {
              if (customId === 'configure-server-tone') return ['other'];
              if (customId === 'configure-server-languages') return [MovieLanguage.German];
              return [];
            },
            getTextInputValue() {
              return 'Europe/Vienna';
            },
            getSelectedChannels() {
              return new Collection([['1469389781023588352', { id: '1469389781023588352' } as TextChannel]]);
            },
          },
        });

        await onModalSubmit(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.server-configuration.validation-failed`,
        });
      });

      it('replies with a error if channel ID validation fails', async () => {
        const interaction = createMockedInteraction(ModalSubmitInteraction, {
          guildId: '1420788362872230051',
          locale: Locale.EnglishUS,
          fields: {
            getStringSelectValues(customId: string) {
              if (customId === 'configure-server-tone') return ['other'];
              if (customId === 'configure-server-languages') return [MovieLanguage.German];
              return [];
            },
            getTextInputValue() {
              return 'Europe/Vienna';
            },
            getSelectedChannels() {
              return new Collection();
            },
          },
        });

        await onModalSubmit(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.server-configuration.validation-failed`,
        });
      });
    });

    describe('when validation succeeds', () => {
      it('creates a new group and saves the configuration if none exists yet', async () => {
        const guildId = '1420788362872230051';
        const discordChannelId = '1469389781023588352';
        const languages = [MovieLanguage.German];
        const botTone = BotTone.Lewd;

        const interaction = createMockedInteraction(ModalSubmitInteraction, {
          guildId,
          locale: Locale.EnglishUS,
          fields: {
            getStringSelectValues(customId: string) {
              if (customId === 'configure-server-tone') return [botTone];
              if (customId === 'configure-server-languages') return languages;
              return [];
            },
            getSelectedChannels() {
              return new Collection([[discordChannelId, { id: discordChannelId } as TextChannel]]);
            },
          },
        });

        await onModalSubmit(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${botTone}.server-configuration.created-or-updated`,
        });

        const [group] = await db.select().from(groupsTable).where(eq(groupsTable.discordId, guildId));
        expect(group).toEqual({
          id: expect.any(String),
          discordId: guildId,
          discordChannelId,
          languages,
          tone: botTone,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('updates a existing group with the new configuration', async () => {
        const [existingGroup] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
            discordChannelId: '1469389781023588352',
            languages: [MovieLanguage.English],
            tone: BotTone.SuperHyped,
          })
          .returning();

        const guildId = '1420788362872230051';
        const discordChannelId = '1469389781023588352';
        const languages = [MovieLanguage.German];
        const botTone = BotTone.Lewd;

        const interaction = createMockedInteraction(ModalSubmitInteraction, {
          guildId,
          locale: Locale.EnglishUS,
          fields: {
            getStringSelectValues(customId: string) {
              if (customId === 'configure-server-tone') return [botTone];
              if (customId === 'configure-server-languages') return languages;
              return [];
            },
            getSelectedChannels() {
              return new Collection([[discordChannelId, { id: discordChannelId } as TextChannel]]);
            },
          },
        });

        await onModalSubmit(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${botTone}.server-configuration.created-or-updated`,
        });

        const [group] = await db.select().from(groupsTable).where(eq(groupsTable.discordId, guildId));
        expect(group).toEqual({
          id: existingGroup!.id,
          discordId: existingGroup!.discordId,
          discordChannelId,
          languages,
          tone: botTone,
          createdAt: existingGroup!.updatedAt,
          updatedAt: expect.any(Date),
        });
      });
    });
  });
});
