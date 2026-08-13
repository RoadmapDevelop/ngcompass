import { createConfig } from '../../tsup.config.js';

export default createConfig({
  entry: {
    index: 'src/index.ts',
    'execution-worker': 'src/execution/execution-worker.ts',
    'type-aware-worker': 'src/execution/type-aware-worker.ts',
  },
  dts: true,
});
