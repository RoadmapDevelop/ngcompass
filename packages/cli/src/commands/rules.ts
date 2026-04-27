import { Command } from 'commander';
import { getRulesReporter } from '@ngcompass/reporters';
import { getRuleListEntries, isBuiltinPreset } from '@ngcompass/rules';
import pc from 'picocolors';
import { exitWithError } from './exit.js';

export function registerRulesCommand(program: Command) {
    program
        .command('rules [ruleName]')
        .description('Browse available rules or inspect details for a specific rule')
        .option('--preset <name>', 'Filter by preset: recommended, strict, performance, reactivity, or all')
        .action((ruleName: string | undefined, opts: { preset?: string }) => {
            if (opts.preset && !isBuiltinPreset(opts.preset)) {
                console.error(pc.red(`Unknown preset: "${opts.preset}". Available: recommended, strict, all, performance, reactivity`));
                exitWithError();
            }

            const entries = getRuleListEntries();
            const reporter = getRulesReporter({ preset: opts.preset });
            
            if (ruleName) {
                const rule = entries.find(e => e.name === ruleName);
                if (!rule) {
                    console.error(pc.red(`Rule "${ruleName}" not found.`));
                    exitWithError();
                    return;
                }
                reporter.renderSingleRule(rule);
            } else {
                reporter.render(entries);
            }
        });
}
