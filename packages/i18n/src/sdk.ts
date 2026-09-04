import i18next from 'i18next';

import { MovieLanguage } from '@flicker/database/schemas/enums';

interface Translations {
  [key: string]: Translations | string;
}

/**
 * Initializes the `i18next` package with all provided languages.
 * @param languages - A map containing each language and it's translations.
 */
export async function initializeI18n(languages: Record<MovieLanguage, Translations>): Promise<void> {
  await i18next.init({
    lng: MovieLanguage.English,
    debug: process.env.NODE_ENV === 'development',
    resources: languages,
  });
}
