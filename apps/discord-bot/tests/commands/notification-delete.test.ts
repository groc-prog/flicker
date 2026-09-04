import { describe, expect, it, type Mock } from 'bun:test';
import { AutocompleteInteraction, ChatInputCommandInteraction, Locale, MessageFlags } from 'discord.js';
import type { InferInsertModel } from 'drizzle-orm';

import db from '@flicker/database';
import { BotTone } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { usersTable } from '@flicker/database/schemas/users';

import { onAutocomplete, onChatInputCommand } from '../../src/commands/server/notification-delete';
import { ServiceError } from '../../src/utils/error';
import { createMockedInteraction } from '../fixtures/interaction';

describe('notification-delete command', () => {
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

    describe('when notification ID is invalid', () => {
      it('replies with a not found error if the notification ID is not found', async () => {
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
            getString: () => '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.not-found`,
        });
      });

      it('replies with a not found error if the notification ID is not a valid UUID', async () => {
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
            getString: () => 'some-other-str',
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification.not-found`,
        });
      });
    });

    describe('when notification ID is valid', () => {
      it('replies with a success message and deletes the notification', async () => {
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
          .values({
            name: 'name',
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
            getString: () => notification!.id,
          },
        });

        await onChatInputCommand(interaction);

        expect(interaction.reply).toHaveBeenNthCalledWith(1, {
          flags: [MessageFlags.Ephemeral],
          content: `tone.${BotTone.Normal}.notification-delete.deleted`,
        });

        const notifications = await db.select().from(notificationsTable);
        expect(notifications).toHaveLength(0);
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
