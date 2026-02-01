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
 * @ngcompass Configuration
 * Reference: https://ngcompass.dev/docs/config
 */
const config: AnalyzerConfig = {
    // Files to include in analysis
    include: ['src/**/*.ts'],
    
    // Files to exclude
    exclude: ['**/*.spec.ts', 'node_modules/**', 'dist/**'],

    // Rule configuration
    rules: {
        // 'component-selector': { severity: 'error', options: { type: 'kebab-case', prefix: 'app' } },
    },

    // Profiles for different environments
    profiles: {
        dev: {
            watch: true,
            maxWorkers: 2
        },
        ci: {
            failOnSeverity: 'high',
            outputFormat: 'json'
        }
    }
};

export default config;
`;

/**
 * Initializes a new configuration file.
 */
export async function initConfig(options: InitOptions = {}): Promise<InitResult> {
    const cwd = options.cwd ?? process.cwd();
    const targetPath = path.join(cwd, 'ngcompass.config.ts');

    // 1. Check if config already exists
    const existing = await findAndLoadConfig(cwd);

    if (existing && !options.force) {
        return {
            success: false,
            filePath: existing.filepath,
            alreadyExists: true
        };
    }

    // 2. Write the template
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
