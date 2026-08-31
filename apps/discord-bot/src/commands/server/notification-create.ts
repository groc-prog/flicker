import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

export async function onChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: 'notification create',
  });
}
