#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from '../commands/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCacheContext } from '@ngcompass/core';
import { enableDebug } from '@ngcompass/common';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Robust package.json discovery (works whether bundled in dist/ or running from src/bin/)
let packageJsonPath = '';
let currentDir = __dirname;
while (currentDir !== path.parse(currentDir).root) {
    const checkPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(checkPath)) {
        packageJsonPath = checkPath;
        break;
    }
    currentDir = path.dirname(currentDir);
}

if (!packageJsonPath) {
    throw new Error('Could not find package.json');
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

/**
 * CLI Entry Point
 */
export async function run() {
    const program = new Command();

    program
        .name('compass')
        .description(packageJson.description || 'Angular Analysis Toolkit')
        .version(packageJson.version)
        .option('--debug', 'Enable debug output (all namespaces)')
        .option('--verbose', 'Enable verbose output (alias for --debug)')
        .hook('preAction', (thisCommand) => {
            const opts = thisCommand.opts();
            if (opts.debug || opts.verbose) {
                enableDebug('debug', 'all');
            }
        });

    // Initialize shared cache context
    const cache = createCacheContext();

    // Register all commands with shared cache
    registerCommands(program, cache);

    // Parse arguments
    program.parse(process.argv);

    // Default to help if no command provided
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

// Execute if run via node
run().catch(err => {
    console.error(err);
    process.exit(1);
});
