import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

import { initializeSDK } from '@flicker/telemetry/sdk';

initializeSDK([new FetchInstrumentation()]);
