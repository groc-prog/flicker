import { describe, expect, it, spyOn } from 'bun:test';

import db from '@flicker/database';
import { MovieLanguage, NotificationRecurrencePattern, NotificationTone } from '@flicker/database/schemas/enums';

import { getNotificationById } from '../../../src/services/notifications';
import { seedNotification, seedUser } from '../../fixtures/user';

describe('notifications service', () => {
  describe('getNotificationById', () => {
    describe('when the database query fails', () => {
      it('throws when the query throws a error', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        const spy = spyOn(db, 'select').mockImplementationOnce(() => {
          return {
            from: () => ({
              where: () => Promise.reject(new Error('mocked-error')),
            }),
          } as never;
        });

        try {
          await getNotificationById(userId, notificationId);
          expect.unreachable();
        } catch (error) {
          expect(spy).toHaveBeenCalledTimes(1);
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe('mocked-error');
        }
      });
    });

    describe('when the query succeeds', () => {
      it('return null when the query does not return the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({
          name: 'name',
          key: 'key',
          userId,
        });

        const spy = spyOn(db, 'select').mockImplementationOnce(() => {
          return {
            from: () => ({
              where: () => Promise.resolve([]),
            }),
          } as never;
        });

        const notification = await getNotificationById('f3e754ef-5e4c-4b0a-9f64-014e9a96af45', notificationId);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(notification).toBeNull();
      });
      it('returns null when the user does not own the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({
          name: 'name',
          key: 'key',
          userId,
        });

        const notification = await getNotificationById('f3e754ef-5e4c-4b0a-9f64-014e9a96af45', notificationId);
        expect(notification).toBeNull();
      });

      it('returns null when the notification is not found', async () => {
        const userId = await seedUser();

        const notification = await getNotificationById(userId, 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
        expect(notification).toBeNull();
      });

      it('returns the partial notification', async () => {
        const userId = await seedUser();

        const data = {
          name: 'name',
          key: 'key',
          preferredLanguage: MovieLanguage.German,
          tone: NotificationTone.Lewd,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Hourly,
          recurrenceInterval: 10,
          userId,
        };
        const notificationId = await seedNotification(data);

        const notification = await getNotificationById(userId, notificationId);
        expect(notification).toEqual({
          id: notificationId,
          name: 'name',
          key: 'key',
          preferredLanguage: MovieLanguage.German,
          tone: NotificationTone.Lewd,
          isRecurring: true,
          recurrencePattern: NotificationRecurrencePattern.Hourly,
          recurrenceInterval: 10,
          nextTriggerAt: null,
        });
      });
    });
  });
});
