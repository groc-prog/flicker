import { context, propagation, trace } from '@opentelemetry/api';

import { ServiceError } from '../error';
import { logger } from './logging';

export const eventTracer = trace.getTracer(`discord.events`);
export const commandTracer = trace.getTracer(`discord.commands`);

/**
 * Serializes a trace parent ID into a custom ID to be used with a modal.
 * @param customId - The custom ID into which the trace parent ID will be serialized.
 * @returns The serialized custom ID.
 */
export function serializeModalCustomId(customId: string): string {
  logger.debug(`Serializing trace parent ID into modal custom ID ${customId}`);
  const carrier: Partial<{ traceparent: string }> = {};

  propagation.inject(context.active(), carrier);
  const serialized = `${customId}:${carrier.traceparent}`;

  logger.debug(`Serialized modal custom ID as ${serialized}`);
  return serialized;
}

/**
 * Deserializes a serialized custom ID into the actual custom ID and the trace parent ID.
 * @param serializedCustomId - The serialized custom ID.
 * @returns The deserialized custom ID and trace parent ID.
 */
export function deserializeTraceParentFromCustomId(serializedCustomId: string): [string, string] {
  logger.debug(`Deserializing custom ID ${serializedCustomId} to extract trace parent`);
  const [modalCustomId, traceParent] = serializedCustomId.split(':');

  if (!modalCustomId) throw new ServiceError('No custom ID found in serialized custom ID');
  if (!traceParent) throw new ServiceError('No trace parent found in serialized custom ID');
  return [modalCustomId, traceParent];
}
