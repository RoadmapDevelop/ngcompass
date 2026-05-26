import { createConfig } from '../../tsup.config.js';

export default createConfig({
  entry: [
    'src/index.ts',
    'src/execution-worker.ts',
    'src/type-aware-worker.ts',
  ],
  dts: true,
});
