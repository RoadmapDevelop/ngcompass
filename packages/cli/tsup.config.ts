import { createConfig } from '../../tsup.config.js';

export default createConfig({
    entry: {
        index: 'src/index.ts',
        cli: 'src/bin/ngcompass.ts',
    },
    banner: {
        js: '#!/usr/bin/env node',
    },
});
