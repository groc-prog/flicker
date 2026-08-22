import { Events, type Client } from 'discord.js';

import { logger } from '../telemetry/logging';

export const once = true;
export const type = Events.ClientReady;

export function execute(client: Client<true>): void {
  logger.info(`Bot ready. Logged in with user ID ${client.user.id}`);
}
