import { describe, expect, it, spyOn } from 'bun:test';
import dayjs from 'dayjs';

import db from '@flicker/database';
import { NotificationTone } from '@flicker/database/schemas/enums';
import { notificationsTable } from '@flicker/database/schemas/notifications';

import { ServiceModuleError, ServiceModuleErrorCode } from '../../../src/error';
import { restoreDeletedNotification } from '../../../src/services/notifications';
import { seedNotification, seedUser } from '../../fixtures/user';

describe('notifications service', () => {
  describe('restoreDeletedNotification', () => {
    describe('when the database query fails', () => {
      it('throws when the user does not own the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({
          name: 'name',
          key: 'key',
          userId,
          deletedAt: dayjs.utc().toDate(),
        });

        try {
          await restoreDeletedNotification('f3e754ef-5e4c-4b0a-9f64-014e9a96af45', notificationId);
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Notification not found');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationNotFound);
        }
      });

      it('throws when the notification is not found', async () => {
        const userId = await seedUser();

        try {
          await restoreDeletedNotification(userId, 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Notification not found');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationNotFound);
        }
      });

      it('throws when the query does not return the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({
          name: 'name',
          key: 'key',
          userId,
          deletedAt: dayjs.utc().toDate(),
        });

        const spy = spyOn(db, 'update').mockImplementationOnce(() => {
          return {
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([]),
              }),
            }),
          } as never;
        });

        try {
          await restoreDeletedNotification(userId, notificationId);
          expect.unreachable();
        } catch (error) {
          expect(spy).toHaveBeenCalledTimes(1);

          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Notification not found');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationNotFound);
        }
      });
    });

    describe('when the notification is restored', () => {
      it('sets the deletedAt timestamp to null on the notification in the database', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({
          name: 'name',
          key: 'key',
          userId,
          deletedAt: dayjs.utc().toDate(),
        });

        await restoreDeletedNotification(userId, notificationId);

        const [notification] = await db.select().from(notificationsTable);
        expect(notification).toEqual({
          id: notificationId,
          name: 'name',
          key: 'key',
          preferredLanguage: null,
          tone: NotificationTone.Normal,
          isRecurring: false,
          recurrencePattern: null,
          recurrenceInterval: null,
          userId,
          nextTriggerAt: null,
          deletedAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      });
    });
  });
});
