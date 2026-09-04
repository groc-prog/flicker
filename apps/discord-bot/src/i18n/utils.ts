import { Locale } from 'discord.js';

import { MovieLanguage } from '@flicker/database/schemas/enums';

/**
 * Resolves the provided locale to one supported by the bot.
 * @param language - The language of the interaction.
 * @returns A locale supported by the bot.
 */
export function getSupportedLocale(language: Locale): MovieLanguage {
  switch (language) {
    case Locale.German:
      return MovieLanguage.German;
    case Locale.EnglishUS:
    case Locale.EnglishGB:
      return MovieLanguage.English;
    default:
      return MovieLanguage.English;
  }
}
