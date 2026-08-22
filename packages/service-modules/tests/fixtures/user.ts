import type { InferInsertModel } from 'drizzle-orm';

import db from '@flicker/database';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { usersTable } from '@flicker/database/schemas/users';

export async function seedUser(
  data?: Partial<Omit<InferInsertModel<typeof usersTable>, 'id' | 'discordId'>>,
): Promise<string> {
  const [user] = await db
    .insert(usersTable)
    .values({
      discordId: 'discord-id',
      ...data,
    })
    .returning({ id: usersTable.id });

  return user!.id;
}

export async function seedNotification(data: Omit<InferInsertModel<typeof notificationsTable>, 'id'>): Promise<string> {
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      ...data,
    })
    .returning({ id: notificationsTable.id });

  return notification!.id;
}
