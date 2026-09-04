import { describe, expect, it } from 'bun:test';
import { ChatInputCommandInteraction, Locale, MessageFlags } from 'discord.js';

import db from '@flicker/database';
import { BotTone, NotificationRecurrencePattern } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { usersTable } from '@flicker/database/schemas/users';

import { onChatInputCommand } from '../../src/commands/server/notification-create';
import { ServiceError } from '../../src/utils/error';
import { createMockedInteraction } from '../fixtures/interaction';

describe('notification-create command', () => {
  describe('onChatInputCommand', () => {
    describe('when previously created records are not found', () => {
      it('throws if the group is not found', async () => {
        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
        });

        expect(async () => {
          await onChatInputCommand(interaction);
        }).toThrow(new ServiceError('No group with Discord ID 1420788362872230051 found'));
      });
    });

    describe('when input validation fails', () => {
      it('replies with a validation error if the name is empty', async () => {
        await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.name.name') return '';
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a validation error if the name exceeds 255 chars', async () => {
        await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.name.name')
                return Array.from({ length: 300 }, () => 'a');
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a validation error if the key is empty', async () => {
        await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.search-term.name') return '';
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a validation error if the key exceeds 255 chars', async () => {
        await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.search-term.name')
                return Array.from({ length: 300 }, () => 'a');
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a validation error if the recurrence interval is a non-positive number', async () => {
        await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 0,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a duplicate notification error if a notification with the same name already exists', async () => {
        const notificationName = 'notification-name';

        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();
        const [user] = await db
          .insert(usersTable)
          .values({
            discordId: '1420788362872230052',
          })
          .returning();
        await db
          .insert(notificationsTable)
          .values({
            name: notificationName,
            key: 'key',
            creatorId: user!.id,
            groupId: group!.id,
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.name.name') return notificationName;
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
              return 'str-value';
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.name-already-exists`,
        });
      });
    });

    describe('when input is valid', () => {
      it('creates a new notification for the group', async () => {
        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();
        const [user] = await db
          .insert(usersTable)
          .values({
            discordId: '1420788362872230052',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.name.name') return 'name';
              if (name === 'server.notification-create.options.search-term.name') return 'search-term';
              if (name === 'server.notification-create.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Hourly;
            },
            getInteger: () => 2,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-create.created`,
        });

        const notifications = await db.select().from(notificationsTable);
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toEqual({
          id: expect.any(String),
          name: 'name',
          key: 'search-term',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Hourly,
          recurrenceInterval: 2,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('creates a non-recurring notification if no recurring settings are defined', async () => {
        const [group] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();
        const [user] = await db
          .insert(usersTable)
          .values({
            discordId: '1420788362872230052',
          })
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-create.options.name.name') return 'name';
              if (name === 'server.notification-create.options.search-term.name') return 'search-term';
              if (name === 'server.notification-create.options.recurrence-pattern.name') return null;
            },
            getInteger: () => null,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-create.created`,
        });

        const notifications = await db.select().from(notificationsTable);
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toEqual({
          id: expect.any(String),
          name: 'name',
          key: 'search-term',
          language: null,
          isRecurring: false,
          recurrencePattern: null,
          recurrenceInterval: null,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });
    });
  });
});
