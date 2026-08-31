import type { MaybePromise } from 'bun';

declare module 'discord.js' {
  interface CommandDefinition {
    modalCustomId?: string;
    onChatInputCommand: (interaction: ChatInputCommandInteraction) => MaybePromise<void>;
    onAutocomplete?: (interaction: AutocompleteInteraction) => MaybePromise<void>;
    onModalSubmit?: (interaction: ModalSubmitInteraction) => MaybePromise<void>;
  }

  interface CommandGroupDefinition {
    command: SharedSlashCommand;
    map: Record<string, CommandDefinition>;
  }

  interface EventDefinition {
    once: boolean;
    type: keyof ClientEvents;
    execute: (...args: unknown[]) => MaybePromise<void>;
  }

  interface Client {
    // This maps back each command name (top level only) to it's command ID
    commandIds: Map<string, string>;
    // This maps back each command name in the format `top-level-command-name:subcommand-group-name:subcommand-name`
    // to it's definition
    commands: Map<string, CommandDefinition>;
    // This maps back each custom ID to the respective command name `onModalSubmit` event for that specific
    // custom ID
    modals: Map<string, string>;
  }
}
