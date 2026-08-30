import type { MaybePromise } from 'bun';
import type { SlashCommandBuilder } from 'discord.js';

declare module 'discord.js' {
  interface CommandDefinition {
    slashCommand: SlashCommandBuilder;
    modalIds?: Record<string, string>;
    onChatInputCommand: (interaction: ChatInputCommandInteraction) => MaybePromise<void>;
    onAutocomplete?: (interaction: AutocompleteInteraction) => MaybePromise<void>;
    onModalSubmit?: (interaction: ModalSubmitInteraction) => MaybePromise<void>;
  }

  interface EventDefinition {
    once: boolean;
    type: keyof ClientEvents;
    execute: (...args: unknown[]) => MaybePromise<void>;
  }

  interface Client {
    commands: Map<string, CommandDefinition>;
    // This maps back each custom ID to the respective command holding the
    // `onModalSubmit` event for that specific custom ID
    modals: Map<string, string>;
  }
}
