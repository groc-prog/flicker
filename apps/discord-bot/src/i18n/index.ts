import { Locale } from 'discord.js';
import i18next from 'i18next';

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
