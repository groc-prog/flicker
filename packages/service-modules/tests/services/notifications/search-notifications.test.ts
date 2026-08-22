import { describe, expect, it } from 'bun:test';
import dayjs from 'dayjs';

import { ServiceModuleError, ServiceModuleErrorCode } from '../../../src/error';
import { DeletedNotificationFilter, searchNotifications } from '../../../src/services/notifications';
import { seedNotification, seedUser } from '../../fixtures/user';

describe('notifications service', () => {
  describe('searchNotifications', () => {
    describe('when payload validation fails', () => {
      it('throws when limit is less than 1', async () => {
        const userId = await seedUser();

        try {
          await searchNotifications(userId, { limit: 0 });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.SearchParamsInvalid);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'number',
                code: 'too_small',
                minimum: 1,
                inclusive: true,
                path: ['limit'],
                message: 'Too small: expected number to be >=1',
              },
            ],
          });
        }
      });

      it('throws when skip is less than 0', async () => {
        const userId = await seedUser();

        try {
          await searchNotifications(userId, { skip: -1 });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.SearchParamsInvalid);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'number',
                code: 'too_small',
                minimum: 0,
                inclusive: true,
                path: ['skip'],
                message: 'Too small: expected number to be >=0',
              },
            ],
          });
        }
      });
    });

    describe('when the search succeeds', () => {
      it('returns results excluding deleted notifications ordered by creation date', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third', deletedAt: dayjs.utc().toDate() },
          { name: 'fourth-notification', key: 'fourth', deletedAt: dayjs.utc().toDate() },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId);
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          name: data[1]!.name,
          id: notificationIds[1]!,
        });
        expect(results[1]).toEqual({
          name: data[0]!.name,
          id: notificationIds[0]!,
        });
      });

      it('returns results with only deleted notifications ordered by deletion date', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third', deletedAt: dayjs.utc().startOf('day').add(10, 'hours').toDate() },
          {
            name: 'fourth-notification',
            key: 'fourth',
            deletedAt: dayjs.utc().startOf('day').add(12, 'hours').toDate(),
          },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          deletedNotifications: DeletedNotificationFilter.OnlyDeleted,
        });
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          name: data[3]!.name,
          id: notificationIds[3]!,
        });
        expect(results[1]).toEqual({
          name: data[2]!.name,
          id: notificationIds[2]!,
        });
      });

      it('returns results with only all notifications ordered by grouped by whether deleted or not and creation/deletion date', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third', deletedAt: dayjs.utc().startOf('day').add(10, 'hours').toDate() },
          {
            name: 'fourth-notification',
            key: 'fourth',
            deletedAt: dayjs.utc().startOf('day').add(12, 'hours').toDate(),
          },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          deletedNotifications: DeletedNotificationFilter.Include,
        });
        expect(results).toHaveLength(4);
        expect(results[0]).toEqual({
          name: data[1]!.name,
          id: notificationIds[1]!,
        });
        expect(results[1]).toEqual({
          name: data[0]!.name,
          id: notificationIds[0]!,
        });
        expect(results[2]).toEqual({
          name: data[3]!.name,
          id: notificationIds[3]!,
        });
        expect(results[3]).toEqual({
          name: data[2]!.name,
          id: notificationIds[2]!,
        });
      });

      it('limits the number of results', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third' },
          { name: 'fourth-notification', key: 'fourth' },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          limit: 2,
        });
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          name: data[3]!.name,
          id: notificationIds[3]!,
        });
        expect(results[1]).toEqual({
          name: data[2]!.name,
          id: notificationIds[2]!,
        });
      });

      it('skips a number of results', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third' },
          { name: 'fourth-notification', key: 'fourth' },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          skip: 2,
        });
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          name: data[1]!.name,
          id: notificationIds[1]!,
        });
        expect(results[1]).toEqual({
          name: data[0]!.name,
          id: notificationIds[0]!,
        });
      });

      it('fuzzy-searches the notification names', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'first-notification', key: 'first' },
          { name: 'second-notification', key: 'second' },
          { name: 'third-notification', key: 'third' },
          { name: 'fourth-notification', key: 'fourth' },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          searchKey: 'secnd-notificaton',
        });
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          name: data[1]!.name,
          id: notificationIds[1]!,
        });
      });

      it('orders fuzzy-searches results by similarity score', async () => {
        const userId = await seedUser();
        const data = [
          { name: 'notification-good-movie', key: 'first' },
          { name: 'notification-bad-movie', key: 'second' },
        ];
        const notificationIds: string[] = [];

        for (const notificationData of data) {
          const notificationId = await seedNotification({ ...notificationData, userId });
          notificationIds.push(notificationId);
        }

        const results = await searchNotifications(userId, {
          searchKey: 'notification good movie',
        });

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          name: data[0]!.name,
          id: notificationIds[0]!,
        });
        expect(results[1]).toEqual({
          name: data[1]!.name,
          id: notificationIds[1]!,
        });
      });
    });
  });
});
