import type { MaybePromise } from 'bun';
import type { SlashCommandBuilder } from 'discord.js';

declare module 'discord.js' {
  interface SlashCommandDefinition {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => MaybePromise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => MaybePromise<void>;
  }

  interface EventDefinition {
    once: boolean;
    type: keyof ClientEvents;
    execute: (...args: unknown[]) => MaybePromise<void>;
  }

  interface Client {
    commands: Map<string, SlashCommandDefinition>;
  }
}
