import { trace } from '@opentelemetry/api';

export const eventTracer = trace.getTracer(`discord.events`);
export const commandTracer = trace.getTracer(`discord.commands`);
