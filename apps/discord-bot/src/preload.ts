import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

import { initializeSDK } from '@flicker/telemetry/sdk';

import { initializeI18n } from './i18n';

initializeSDK([new FetchInstrumentation()]);
await initializeI18n();
