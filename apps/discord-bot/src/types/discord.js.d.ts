import type { MaybePromise } from 'bun';
import type { SharedSlashCommand } from 'discord.js';

declare module 'discord.js' {
  interface CommandDefinition {
    command: SharedSlashCommand;
    modalCustomId?: string;
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
    // Maps back each modal ID to it's related command definition
    modals: Map<string, CommandDefinition>;
    // Maps back each command name to it's command ID
    commandIds: Map<string, string>;
    // Maps back each command name to it's definition
    commands: Map<string, CommandDefinition>;
    // This maps back each custom ID to the respective command name `onModalSubmit` event for that specific
    // custom ID
    modals: Map<string, string>;
  }
}
