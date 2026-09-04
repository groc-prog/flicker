import { Eta } from 'eta';
import { t } from 'i18next';

import type { MovieLanguage } from '@flicker/database/schemas/enums';

/**
 * Renders the template for a given translation key.
 * @param translationKey - The key in the translation file to use.
 * @param language - The Discord locale to use.
 * @param context - Context variables for template rendering.
 * @returns The rendered template.
 */
export function renderTemplate(
  translationKey: string,
  language: MovieLanguage,
  context: Record<string, unknown> = {},
): string {
  const eta = new Eta();
  const template = t(translationKey, { lng: language });

  return eta.renderString(template, context);
}
