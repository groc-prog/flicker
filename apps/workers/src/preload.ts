import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

import { initializeSDK } from '@flicker/telemetry/sdk';

initializeSDK([new FetchInstrumentation()]);

const sqliteFile = Bun.file(process.env.BUNQUEUE_DATA_PATH);
if (!(await sqliteFile.exists())) {
  await Bun.write(process.env.BUNQUEUE_DATA_PATH, '');
}
