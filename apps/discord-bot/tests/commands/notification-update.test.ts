import { describe, expect, it, type Mock } from 'bun:test';
import { AutocompleteInteraction, ChatInputCommandInteraction, Locale, MessageFlags } from 'discord.js';
import { eq, type InferInsertModel } from 'drizzle-orm';

import db from '@flicker/database';
import { BotTone, NotificationRecurrencePattern } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { usersTable } from '@flicker/database/schemas/users';

import { onAutocomplete, onChatInputCommand } from '../../src/commands/server/notification-update';
import { ServiceError } from '../../src/utils/error';
import { createMockedInteraction } from '../fixtures/interaction';

describe('notification-update command', () => {
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

    describe('when notification validation fails', () => {
      it('replies with a not found error if the notification ID is not a valid UUID', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => 'some-other-str',
            getInteger: () => 0,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.not-found`,
        });
      });

      it('replies with a validation error if the new notification name is empty', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.search-term.name') return 'search-term';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return '';
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

      it('replies with a validation error if the new notification name exceeds 255 chars', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.search-term.name') return 'search-term';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return Array.from({ length: 300 }, () => 'a');
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

      it('replies with a validation error if the new notification key is empty', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.name.name') return 'name';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return '';
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

      it('replies with a validation error if the new notification key exceeds 255 chars', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.name.name') return 'name';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return Array.from({ length: 300 }, () => 'a');
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

      it('replies with a validation error if the new notification recurrence interval is less than 0', async () => {
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
        await db.insert(notificationsTable).values({
          name: 'name',
          key: 'key',
          creatorId: user!.id,
          groupId: group!.id,
        });

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.name.name') return 'name';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return 'search-term';
            },
            getInteger: () => -1,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.validation-failed`,
        });
      });

      it('replies with a validation error if the new notification name already exists', async () => {
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
        await db.insert(notificationsTable).values([
          {
            name: 'name',
            key: 'key',
            creatorId: user!.id,
            groupId: group!.id,
          },
          {
            name: 'updated-name',
            key: 'updated-key',
            creatorId: user!.id,
            groupId: group!.id,
          },
        ]);

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.search-term.name') return 'search-term';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return 'updated-name';
            },
            getInteger: () => 0,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.name-already-exists`,
        });
      });
    });

    describe('when notification does not exist', () => {
      it('replies with a not found error', async () => {
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
              if (name === 'server.notification-update.options.notification.name')
                return '7578d1ea-ca48-4f1c-ad77-96a40682420d';
              if (name === 'server.notification-update.options.search-term.name') return 'search-term';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return 'updated-name';
            },
            getInteger: () => 0,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.not-found`,
        });
      });
    });

    describe('when notification is updated', () => {
      it('updates all provided notification options', async () => {
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
        const [notification] = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'name',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name') return notification?.id;
              if (name === 'server.notification-update.options.search-term.name') return 'updated-key';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Weekly;
              return 'updated-name';
            },
            getInteger: () => 4,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-update.updated`,
        });

        const [updatedNotification] = await db
          .select()
          .from(notificationsTable)
          .where(eq(notificationsTable.id, notification!.id));

        expect(updatedNotification).not.toBeUndefined();
        expect(updatedNotification!).toEqual({
          id: notification!.id,
          name: 'updated-name',
          key: 'updated-key',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Weekly,
          recurrenceInterval: 4,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('keeps notification name unchanged', async () => {
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
        const [notification] = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'name',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name') return notification?.id;
              if (name === 'server.notification-update.options.search-term.name') return 'updated-key';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Weekly;
              return 'name';
            },
            getInteger: () => 4,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-update.updated`,
        });

        const [updatedNotification] = await db
          .select()
          .from(notificationsTable)
          .where(eq(notificationsTable.id, notification!.id));

        expect(updatedNotification).not.toBeUndefined();
        expect(updatedNotification!).toEqual({
          id: notification!.id,
          name: 'name',
          key: 'updated-key',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Weekly,
          recurrenceInterval: 4,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('keeps notification key unchanged', async () => {
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
        const [notification] = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'name',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name') return notification?.id;
              if (name === 'server.notification-update.options.search-term.name') return 'key';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Weekly;
              return 'updated-name';
            },
            getInteger: () => 4,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-update.updated`,
        });

        const [updatedNotification] = await db
          .select()
          .from(notificationsTable)
          .where(eq(notificationsTable.id, notification!.id));

        expect(updatedNotification).not.toBeUndefined();
        expect(updatedNotification!).toEqual({
          id: notification!.id,
          name: 'updated-name',
          key: 'key',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Weekly,
          recurrenceInterval: 4,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('keeps notification recurrence pattern unchanged if `NotificationRecurrencePattern.Unchanged` is defined', async () => {
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
        const [notification] = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'name',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
              recurrencePattern: NotificationRecurrencePattern.Weekly,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name') return notification?.id;
              if (name === 'server.notification-update.options.search-term.name') return 'key';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Unchanged;
              return 'name';
            },
            getInteger: () => 4,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-update.updated`,
        });

        const [updatedNotification] = await db
          .select()
          .from(notificationsTable)
          .where(eq(notificationsTable.id, notification!.id));

        expect(updatedNotification).not.toBeUndefined();
        expect(updatedNotification!).toEqual({
          id: notification!.id,
          name: 'name',
          key: 'key',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Weekly,
          recurrenceInterval: 4,
          creatorId: user!.id,
          userId: null,
          groupId: group!.id,
          nextTriggerAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });

      it('keeps notification recurrence interval unchanged if `0` is defined', async () => {
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
        const [notification] = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'name',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
              recurrenceInterval: 4,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(ChatInputCommandInteraction, {
          guildId: group?.discordId,
          user: {
            id: user?.discordId,
          },
          locale: Locale.EnglishUS,
          options: {
            getString: (name: string) => {
              if (name === 'server.notification-update.options.notification.name') return notification?.id;
              if (name === 'server.notification-update.options.search-term.name') return 'key';
              if (name === 'server.notification-update.options.recurrence-pattern.name')
                return NotificationRecurrencePattern.Weekly;
              return 'name';
            },
            getInteger: () => 0,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-update.updated`,
        });

        const [updatedNotification] = await db
          .select()
          .from(notificationsTable)
          .where(eq(notificationsTable.id, notification!.id));

        expect(updatedNotification).not.toBeUndefined();
        expect(updatedNotification!).toEqual({
          id: notification!.id,
          name: 'name',
          key: 'key',
          language: null,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Weekly,
          recurrenceInterval: 4,
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

  describe('onAutocomplete', () => {
    describe('when no search input is given', () => {
      it('returns notifications owned by the group ordered alphabetically descending', async () => {
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

        const notifications = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'b',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'd',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'a',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'c',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => null,
          },
        });
        await onAutocomplete(interaction);

        expect(interaction.respond).toHaveBeenNthCalledWith(1, [
          { name: 'a', value: notifications.find(({ name }) => name === 'a')!.id },
          { name: 'b', value: notifications.find(({ name }) => name === 'b')!.id },
          { name: 'c', value: notifications.find(({ name }) => name === 'c')!.id },
          { name: 'd', value: notifications.find(({ name }) => name === 'd')!.id },
        ]);
      });

      it('excludes notifications not owned by the current group', async () => {
        const [ownerGroup] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();
        const [otherGroup] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230053',
          })
          .returning();
        const [user] = await db
          .insert(usersTable)
          .values({
            discordId: '1420788362872230052',
          })
          .returning();

        const notifications = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'b',
              key: 'key',
              creatorId: user!.id,
              groupId: ownerGroup!.id,
            },
            {
              name: 'd',
              key: 'key',
              creatorId: user!.id,
              groupId: otherGroup!.id,
            },
            {
              name: 'a',
              key: 'key',
              creatorId: user!.id,
              groupId: otherGroup!.id,
            },
            {
              name: 'c',
              key: 'key',
              creatorId: user!.id,
              groupId: ownerGroup!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => null,
          },
        });
        await onAutocomplete(interaction);

        expect(interaction.respond).toHaveBeenNthCalledWith(1, [
          { name: 'b', value: notifications.find(({ name }) => name === 'b')!.id },
          { name: 'c', value: notifications.find(({ name }) => name === 'c')!.id },
        ]);
      });

      it('limits the maximum number of returned results to 25', async () => {
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

        const notifications: InferInsertModel<typeof notificationsTable>[] = [];
        for (let index = 0; index < 30; index++) {
          notifications.push({
            name: `name${index}`,
            key: 'key',
            creatorId: user!.id,
            groupId: group!.id,
          });
        }
        await db.insert(notificationsTable).values(notifications);

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => null,
          },
        });
        await onAutocomplete(interaction);

        const args = (interaction.respond as Mock<(...args: unknown[]) => unknown>).mock.calls[0]?.[0];
        expect(interaction.respond).toHaveBeenCalledTimes(1);
        expect(args).toBeArray();
        expect(args).toHaveLength(25);
      });
    });

    describe('when search input is given', () => {
      it('returns notifications owned by the group ordered by a similarity score', async () => {
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

        const notifications = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'dune',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'dune 2',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'obsession',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
            {
              name: 'weapons',
              key: 'key',
              creatorId: user!.id,
              groupId: group!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => 'dun',
          },
        });
        await onAutocomplete(interaction);

        expect(interaction.respond).toHaveBeenNthCalledWith(1, [
          { name: 'dune', value: notifications.find(({ name }) => name === 'dune')!.id },
          { name: 'dune 2', value: notifications.find(({ name }) => name === 'dune 2')!.id },
          { name: 'obsession', value: notifications.find(({ name }) => name === 'obsession')!.id },
          { name: 'weapons', value: notifications.find(({ name }) => name === 'weapons')!.id },
        ]);
      });

      it('excludes notifications not owned by the current group', async () => {
        const [ownerGroup] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230051',
          })
          .returning();
        const [otherGroup] = await db
          .insert(groupsTable)
          .values({
            discordId: '1420788362872230053',
          })
          .returning();
        const [user] = await db
          .insert(usersTable)
          .values({
            discordId: '1420788362872230052',
          })
          .returning();

        const notifications = await db
          .insert(notificationsTable)
          .values([
            {
              name: 'dune',
              key: 'key',
              creatorId: user!.id,
              groupId: ownerGroup!.id,
            },
            {
              name: 'dune 2',
              key: 'key',
              creatorId: user!.id,
              groupId: otherGroup!.id,
            },
            {
              name: 'obsession',
              key: 'key',
              creatorId: user!.id,
              groupId: ownerGroup!.id,
            },
            {
              name: 'weapons',
              key: 'key',
              creatorId: user!.id,
              groupId: ownerGroup!.id,
            },
          ])
          .returning();

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => 'dun',
          },
        });
        await onAutocomplete(interaction);

        expect(interaction.respond).toHaveBeenNthCalledWith(1, [
          { name: 'dune', value: notifications.find(({ name }) => name === 'dune')!.id },
          { name: 'obsession', value: notifications.find(({ name }) => name === 'obsession')!.id },
          { name: 'weapons', value: notifications.find(({ name }) => name === 'weapons')!.id },
        ]);
      });

      it('limits the maximum number of returned results to 25', async () => {
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

        const notifications: InferInsertModel<typeof notificationsTable>[] = [];
        for (let index = 0; index < 30; index++) {
          notifications.push({
            name: `name${index}`,
            key: 'key',
            creatorId: user!.id,
            groupId: group!.id,
          });
        }
        await db.insert(notificationsTable).values(notifications);

        const interaction = createMockedInteraction(AutocompleteInteraction, {
          guildId: '1420788362872230051',
          user: {
            id: '1420788362872230052',
          },
          locale: Locale.EnglishUS,
          options: {
            getString: () => 'name',
          },
        });
        await onAutocomplete(interaction);

        const args = (interaction.respond as Mock<(...args: unknown[]) => unknown>).mock.calls[0]?.[0];
        expect(interaction.respond).toHaveBeenCalledTimes(1);
        expect(args).toBeArray();
        expect(args).toHaveLength(25);
      });
    });
  });
});
