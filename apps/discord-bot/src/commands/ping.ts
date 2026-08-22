import { ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild)
  .setName('ping')
  .setDescription('Replies with Pong!');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: 'Pong!',
    flags: [MessageFlags.Ephemeral],
  });
}
