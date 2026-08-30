import { Locale } from 'discord.js';
import { Eta } from 'eta';
import i18next, { t } from 'i18next';

import de from './locales/de.json';
import en from './locales/en.json';

export async function initializeI18n() {
  await i18next.init({
    lng: Locale.EnglishUS,
    debug: process.env.NODE_ENV === 'development',
    resources: {
      [Locale.German]: {
        translation: de,
      },
      [Locale.EnglishUS]: {
        translation: en,
      },
    },
  });
}

/**
 * Resolves the provided locale to one supported by the bot.
 * @param language - The language of the interaction.
 * @returns A locale supported by the bot.
 */
export function getSupportedLocale(language: Locale): Locale.EnglishUS | Locale.German {
  switch (language) {
    case Locale.EnglishUS:
    case Locale.German:
      return language;
    case Locale.EnglishGB:
      return Locale.EnglishUS;
    default:
      return Locale.EnglishUS;
  }
}

/**
 * Renders the template for a given translation key.
 * @param translationKey - The key in the translation file to use.
 * @param language - The Discord locale to use.
 * @param context - Context variables for template rendering.
 * @returns The rendered template.
 */
export function renderTemplate(
  translationKey: string,
  language: Locale,
  context: Record<string, unknown> = {},
): string {
  const eta = new Eta();
  const template = t(translationKey, { lng: getSupportedLocale(language) });

  return eta.renderString(template, context);
}
