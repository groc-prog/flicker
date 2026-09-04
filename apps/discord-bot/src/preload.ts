import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

import { MovieLanguage } from '@flicker/database/schemas/enums';
import { initializeI18n } from '@flicker/i18n/sdk';
import { initializeSDK } from '@flicker/telemetry/sdk';

import de from './i18n/locales/de.json';
import en from './i18n/locales/en.json';

initializeSDK([new FetchInstrumentation()]);
await initializeI18n({
  [MovieLanguage.German]: de,
  [MovieLanguage.English]: en,
});
