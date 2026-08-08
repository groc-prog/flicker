import { initializeSDK } from '@flicker/telemetry/sdk';

import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

initializeSDK([new FetchInstrumentation()]);
