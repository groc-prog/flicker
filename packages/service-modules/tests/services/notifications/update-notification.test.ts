import { describe, expect, it, spyOn } from 'bun:test';

import db from '@flicker/database';
import { NotificationTone } from '@flicker/database/schemas/enums';
import { notificationsTable } from '@flicker/database/schemas/notifications';

import { ServiceModuleError, ServiceModuleErrorCode } from '../../../src/error';
import { updateNotification } from '../../../src/services/notifications';
import { seedNotification, seedUser } from '../../fixtures/user';

describe('notifications service', () => {
  describe('updateNotification', () => {
    describe('when payload validation fails', () => {
      it('throws when the notification name is too small or empty', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification(userId, notificationId, { name: '' });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationValidationFailed);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'string',
                code: 'too_small',
                minimum: 1,
                inclusive: true,
                path: ['name'],
                message: 'Too small: expected string to have >=1 characters',
              },
            ],
          });
        }
      });

      it('throws when the notification name is too long', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification(userId, notificationId, { name: 'a'.repeat(251) });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationValidationFailed);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'string',
                code: 'too_big',
                maximum: 250,
                inclusive: true,
                path: ['name'],
                message: 'Too big: expected string to have <=250 characters',
              },
            ],
          });
        }
      });

      it('throws when the notification key is too small or empty', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification(userId, notificationId, { key: '' });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationValidationFailed);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'string',
                code: 'too_small',
                minimum: 1,
                inclusive: true,
                path: ['key'],
                message: 'Too small: expected string to have >=1 characters',
              },
            ],
          });
        }
      });

      it('throws when the notification key is too long', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification(userId, notificationId, { key: 'a'.repeat(251) });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationValidationFailed);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'string',
                code: 'too_big',
                maximum: 250,
                inclusive: true,
                path: ['key'],
                message: 'Too big: expected string to have <=250 characters',
              },
            ],
          });
        }
      });

      it('throws when the recurrence interval is a negative number', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification(userId, notificationId, { recurrenceInterval: -2 });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Payload validation failed');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationValidationFailed);
          expect(error.metadata).toEqual({
            issues: [
              {
                origin: 'number',
                code: 'too_small',
                minimum: 0,
                inclusive: false,
                path: ['recurrenceInterval'],
                message: 'Too small: expected number to be >0',
              },
            ],
          });
        }
      });
    });

    describe('when the database query fails', () => {
      it('throws when the user does not own the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        try {
          await updateNotification('f3e754ef-5e4c-4b0a-9f64-014e9a96af45', notificationId, {
            name: 'name',
          });
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
          await updateNotification(userId, 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45', {
            name: 'name',
          });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Notification not found');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationNotFound);
        }
      });

      it('throws when the query does not return the notification', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

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
          await updateNotification(userId, notificationId, {
            name: 'name-updated',
          });
          expect.unreachable();
        } catch (error) {
          expect(spy).toHaveBeenCalledTimes(1);

          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('Notification not found');
          expect(error.code).toBe(ServiceModuleErrorCode.NotificationNotFound);
        }
      });
    });

    describe('when the notification is updated', () => {
      it('updates the notification in the database', async () => {
        const userId = await seedUser();
        const notificationId = await seedNotification({ name: 'name', key: 'key', userId });

        await updateNotification(userId, notificationId, {
          name: 'name-updated',
        });

        const [notification] = await db.select().from(notificationsTable);
        expect(notification).toEqual({
          id: notificationId,
          name: 'name-updated',
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
