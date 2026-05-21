/**
 * @fileoverview
 * Build configuration entry point for the `@ngcompass/common` package.
 *
 * Delegates shared tsup defaults to the repository-level factory while
 * declaring the package-local public TypeScript entry file.
 */

import { createConfig } from '../../tsup.config.js';

export default createConfig({
    entry: ['src/index.ts'],
});
