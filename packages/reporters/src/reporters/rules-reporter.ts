import pc from 'picocolors';

import type { RuleListEntry } from '@ngcompass/common';

const DOMAIN_ORDER = [
    'correctness',
    'performance',
    'security',
    'ssr',
    'reactivity',
    'modern-api',
    'template',
    'testing',
];



function severityBadge(severity: string): string {
    switch (severity) {
        case 'error': return pc.red(pc.bold('error'));
        case 'warn':  return pc.yellow('warn ');
        default:      return pc.dim(severity.padEnd(5));
    }
}



export interface RulesReporterOptions {
    preset?: string;
}

export class RulesReporter {
    constructor(private readonly options: RulesReporterOptions = {}) {
    }

    render(entries: RuleListEntry[]): void {
        const filtered = this.options.preset
            ? entries.filter(e => e.presets.includes(this.options.preset!))
            : entries;

        const grouped = new Map<string, RuleListEntry[]>();
        for (const entry of filtered) {
            const group = grouped.get(entry.domain) ?? [];
            group.push(entry);
            grouped.set(entry.domain, group);
        }

        const sortedDomains = [...grouped.keys()].sort(
            (a, b) => (DOMAIN_ORDER.indexOf(a) === -1 ? 99 : DOMAIN_ORDER.indexOf(a))
                     - (DOMAIN_ORDER.indexOf(b) === -1 ? 99 : DOMAIN_ORDER.indexOf(b))
        );

        const presetLabel = this.options.preset
            ? ` ${pc.dim('·')} ${pc.cyan(this.options.preset)}`
            : '';

        console.log();
        console.log(`${pc.bold('ngcompass')} ${pc.dim(`rules:`)} ${pc.white(filtered.length)}${presetLabel}`);

        for (const domain of sortedDomains) {
            const rules = grouped.get(domain)!;

            for (const rule of rules) {
                const badge = severityBadge(rule.severity);
                console.log(`${badge}  ${pc.white(rule.name)}  ${pc.dim(domain)}`);
            }
        }
    }

    renderSingleRule(rule: RuleListEntry): void {
        console.log();
        console.log(`Rule:        ${pc.white(pc.bold(rule.name))}`);
        console.log(`Description: ${pc.dim(rule.description)}`);
        console.log(`Domain:      ${pc.magenta(rule.domain)}`);
        console.log(`Severity:    ${severityBadge(rule.severity)}`);
        
        if (rule.presets.length > 0) {
            console.log(`Presets:     ${pc.cyan(rule.presets.join(', '))}`);
        }
        console.log();
    }
}
