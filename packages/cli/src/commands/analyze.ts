import { Command } from 'commander';
import { initConfig, CacheContext } from '@ngcompass/core';
import { getConfigReporter } from '@ngcompass/reporters';

/**
 * Registers the 'analyze' command.
 */
export function registerAnalyzeCommand(program: Command, _cache: CacheContext) {
    program
        .command('analyze')
        .description('Run analysis on the project')
        .option('-p, --profile <name>', 'Configuration profile to use')
        .action(async (options) => {
            console.log("Not yet implemented")
        });
}
