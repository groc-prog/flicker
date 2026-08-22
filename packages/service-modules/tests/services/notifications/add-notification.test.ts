import { describe, expect, it, spyOn } from 'bun:test';

import db from '@flicker/database';
import { MovieLanguage, NotificationTone } from '@flicker/database/schemas/enums';
import { notificationsTable } from '@flicker/database/schemas/notifications';

import { ServiceModuleError, ServiceModuleErrorCode } from '../../../src/error';
import { addNotification } from '../../../src/services/notifications';
import { seedUser } from '../../fixtures/user';

describe('notifications service', () => {
  describe('addNotification', () => {
    describe('when payload validation fails', () => {
      it('throws when the notification name is too small or empty', async () => {
        try {
          await addNotification('user-id', { name: '', key: 'key' });
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
        try {
          await addNotification('user-id', { name: 'a'.repeat(251), key: 'key' });
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
        try {
          await addNotification('user-id', { name: 'name', key: '' });
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
        try {
          await addNotification('user-id', { name: 'name', key: 'a'.repeat(251) });
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
        try {
          await addNotification('user-id', { name: 'name', key: 'key', recurrenceInterval: -2 });
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
      it('throws when the user ID is not found', async () => {
        try {
          await addNotification('f3e754ef-5e4c-4b0a-9f64-014e9a96af45', {
            name: 'name',
            key: 'key',
          });
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('User not found');
          expect(error.code).toBe(ServiceModuleErrorCode.UserNotFound);
        }
      });

      it('throws when the query does not return the notification', async () => {
        const userId = await seedUser();

        const spy = spyOn(db, 'insert').mockImplementationOnce(() => {
          return {
            values: () => ({
              returning: () => Promise.resolve([]),
            }),
          } as never;
        });

        try {
          await addNotification(userId, {
            name: 'name',
            key: 'key',
          });
          expect.unreachable();
        } catch (error) {
          expect(spy).toHaveBeenCalledTimes(1);

          expect(error).toBeInstanceOf(ServiceModuleError);
          expect(error.message).toBe('No notification was created');
          expect(error.code).toBe(ServiceModuleErrorCode.NoQueryReturnValue);
        }
      });
    });

    describe('when the notification is created', () => {
      it('returns the ID of the created notification', async () => {
        const userId = await seedUser();
        const notificationId = await addNotification(userId, {
          name: 'name',
          key: 'key',
        });

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

      it('creates the notification with defaults from the user', async () => {
        const defaults = {
          preferredLanguage: MovieLanguage.German,
          tone: NotificationTone.Lewd,
        };

        const userId = await seedUser(defaults);
        const notificationId = await addNotification(userId, {
          name: 'name',
          key: 'key',
        });

        const [notification] = await db.select().from(notificationsTable);
        expect(notification).toEqual({
          id: notificationId,
          name: 'name',
          key: 'key',
          preferredLanguage: defaults.preferredLanguage,
          tone: defaults.tone,
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

      it('creates the notification with provided options and defaults from the user', async () => {
        const defaults = {
          preferredLanguage: MovieLanguage.German,
          tone: NotificationTone.Lewd,
        };

        const userId = await seedUser(defaults);
        const notificationId = await addNotification(userId, {
          name: 'name',
          key: 'key',
          tone: NotificationTone.SuperHyped,
        });

        const [notification] = await db.select().from(notificationsTable);
        expect(notification).toEqual({
          id: notificationId,
          name: 'name',
          key: 'key',
          preferredLanguage: defaults.preferredLanguage,
          tone: NotificationTone.SuperHyped,
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
