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
 * @ngcompass Configuration - Production Ready
 *
 * Complete configuration template with all available options.
 * Uncomment and adjust settings as needed for your project.
 *
 * Documentation: https://ngcompass.dev/docs/config
 */
const config: AnalyzerConfig = {
    // ==========================================================================
    // EXTENDS (Presets)
    // ==========================================================================

    // Extend from shared configurations or presets
    extends: 'ngcompass:recommended',
    // extends: ['ngcompass:recommended', './custom-rules.config.ts'],

    // ==========================================================================
    // FILE PATTERNS
    // ==========================================================================

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

    // ==========================================================================
    // ANALYSIS SETTINGS
    // ==========================================================================

    failOnSeverity: 'high',
    maxWorkers: 4,
    maxWarnings: 10,

    // ==========================================================================
    // WATCH MODE
    // ==========================================================================

    watch: false,
    watchOptions: {
        debounce: 300,
        ignored: ['node_modules', 'dist', '.git']
    },

    // ==========================================================================
    // AUTO-FIX
    // ==========================================================================

    autoFix: false,
    autoFixOnSave: false,

    // ==========================================================================
    // OUTPUT
    // ==========================================================================

    outputFormat: 'text',
    // outputPath: './reports/ngcompass-report.json',
    reportUnusedDisableDirectives: true,

    // ==========================================================================
    // IGNORE PATTERNS
    // ==========================================================================

    ignorePatterns: [
        '**/*.min.js',
        '**/*.generated.ts'
    ],

    // ==========================================================================
    // CACHE
    // ==========================================================================

    cache: {
        enabled: true,
        location: 'node_modules/.cache/ngcompass',
        strategy: 'local',
        ttl: 86400000 // 24 hours
    },

    // ==========================================================================
    // PARSER OPTIONS
    // ==========================================================================

    parserOptions: {
        // project: './tsconfig.json',
        // tsconfigRootDir: '.',
        sourceType: 'module',
        ecmaVersion: 2022
    },

    // ==========================================================================
    // RULES
    // ==========================================================================

    rules: {
        // Example rules - uncomment and configure as needed:
        // 'component-selector': { severity: 'high', options: { type: 'kebab-case', prefix: 'app' } },
        // 'directive-selector': { severity: 'high', options: { type: 'camelCase', prefix: 'app' } },
        // 'no-input-rename': 'moderate',
        // 'no-output-rename': 'moderate',
        // 'use-lifecycle-interface': 'low',
        // 'prefer-on-push': 'info',
    },

    // ==========================================================================
    // PROFILES
    // ==========================================================================

    profiles: {
        // Development: fast feedback with watch mode
        dev: {
            watch: true,
            failOnSeverity: 'critical',
            maxWorkers: 2,
            maxWarnings: 50,
            watchOptions: {
                debounce: 200
            },
            cache: {
                enabled: true,
                strategy: 'memory'
            }
        },

        // CI/CD: strict validation for pipelines
        ci: {
            failOnSeverity: 'high',
            maxWorkers: 8,
            maxWarnings: 0,
            outputFormat: 'json',
            outputPath: './reports/ngcompass-ci.json',
            reportUnusedDisableDirectives: true,
            cache: {
                enabled: true,
                strategy: 'local'
            }
        },

        // Production: comprehensive checks before deployment
        prod: {
            failOnSeverity: 'moderate',
            maxWarnings: 0,
            outputFormat: 'html',
            outputPath: './reports/ngcompass-prod.html'
        },

        // Quick: fast checks with minimal rules
        quick: {
            failOnSeverity: 'critical',
            maxWorkers: 2,
            maxWarnings: 100,
            cache: {
                enabled: true,
                strategy: 'memory'
            }
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
