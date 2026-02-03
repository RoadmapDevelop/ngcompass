import { Command } from 'commander';
import { resolveConfig, scan, CacheContext } from '@ngcompass/core';
import { getConfigReporter } from '@ngcompass/reporters';
import ora from 'ora';

/**
 * Registers the 'analyze' command.
 */
export function registerAnalyzeCommand(program: Command, cache: CacheContext) {
    program
        .command('analyze')
        .description('Run analysis on the project')
        .option('-p, --profile <name>', 'Configuration profile to use')
        .option('-v, --verbose', 'Print discovered files')
        .action(async (options) => {
            throw new Error('Not implemented');
        });
}
