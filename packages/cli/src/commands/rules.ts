/**
 * @fileoverview
 * `ngcompass rules` command.
 *
 * With no argument, prints the full catalog of built-in rules (optionally
 * filtered to a single preset). With a rule name, prints the detailed entry
 * for that rule. Catalog rendering is delegated to the rules reporter.
 */

import { Command } from 'commander';
import { getRulesReporter } from '@ngcompass/reporters';
import { getRuleListEntries, isBuiltinPreset } from '@ngcompass/rules';
import pc from 'picocolors';
import { exitWithError, printError } from './exit.js';

export function registerRulesCommand(program: Command) {
    program
        .command('rules [ruleName]')
        .description('Browse available rules or inspect details for a specific rule')
        .option('--preset <name>', 'Filter by preset: recommended, strict, performance, reactivity, or all')
        .action((ruleName: string | undefined, opts: { preset?: string }) => {
            if (opts.preset && !isBuiltinPreset(opts.preset)) {
                printError(`Unknown preset: "${opts.preset}".`);
                process.stderr.write(pc.dim('Available presets: recommended, strict, all, performance, reactivity\n'));
                exitWithError();
            }

            const entries = getRuleListEntries();
            const reporter = getRulesReporter({ preset: opts.preset });

            if (ruleName) {
                const rule = entries.find(e => e.name === ruleName);
                if (!rule) {
                    printError(`Rule "${ruleName}" not found.`);
                    process.stderr.write(pc.dim('Run `ngcompass rules` to list available rules.\n'));
                    exitWithError();
                    return;
                }
                reporter.renderSingleRule(rule);
            } else {
                reporter.render(entries);
            }
        });
}
