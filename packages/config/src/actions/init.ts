import fs from 'node:fs/promises';
import path from 'node:path';
import type { InitResult } from '@ngcompass/common';

export class ConfigExistsError extends Error {
    constructor(path: string) {
        super(`Configuration file already exists at: ${path}`);
        this.name = 'ConfigExistsError';
    }
}

export interface InitOptions {
    cwd?: string;
    force?: boolean;
}

const TEMPLATE = `import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: [
    'src/**/*.ts',
    'src/**/*.html',
  ],

  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '**/*.d.ts',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
`;

export async function initConfig(options: InitOptions = {}): Promise<InitResult> {
    const cwd = options.cwd ?? process.cwd();
    const targetPath = path.join(cwd, 'ngcompass.config.ts');
    // Only check the target directory — never walk up. Walking up (as the
    // analyze/run path does) would treat a stray ngcompass.config.ts in any
    // ancestor directory as "already exists" and block init in this project.
    const exists = await fs.access(targetPath).then(() => true, () => false);

    if (exists && !options.force) {
        return {
            success: false,
            filePath: targetPath,
            alreadyExists: true
        };
    }

    try {
        await fs.writeFile(targetPath, TEMPLATE, 'utf-8');
        return {
            success: true,
            filePath: targetPath
        };
    } catch (error) {
        return {
            success: false,
            filePath: targetPath
        };
    }
}

