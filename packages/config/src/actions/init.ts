import fs from 'node:fs/promises';
import path from 'node:path';
import { findAndLoadConfig } from '../loaders/discovery.js';
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

const TEMPLATE = `import type { AnalyzerConfig } from '@ngcompass/common';

/**
 * Minimal starter configuration for ngcompass.
 * Documentation: https://github.com/SigoudisEftimis/ngcompass_#readme
 */
const config: AnalyzerConfig = {
    extends: 'ngcompass:recommended',

    include: [
        'src/**/*.ts',
        'src/**/*.html'
    ],

    exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/*.test.ts'
    ],

    profiles: {
        ci: {
            outputFormat: 'json',
            maxWarnings: 0
        }
    }
};

export default config;
`;

export async function initConfig(options: InitOptions = {}): Promise<InitResult> {
    const cwd = options.cwd ?? process.cwd();
    const targetPath = path.join(cwd, 'ngcompass.config.ts');
    const existing = await findAndLoadConfig(cwd);

    if (existing && !options.force) {
        return {
            success: false,
            filePath: existing.filepath,
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

