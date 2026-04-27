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

const NGCOMPASS_BANNER = [
    ' _ __   __ _  ___ ___  _ __ ___  _ __   __ _ ___ ___ ',
    "| '_ \\ / _` |/ __/ _ \\| '_ ` _ \\| '_ \\ / _` / __/ __|",
    '| | | | (_| | (_| (_) | | | | | | |_) | (_| \\__ \\__ \\',
    '|_| |_|\\__, |\\___\\___/|_| |_| |_| .__/ \\__,_|___/___/',
    '       |___/                    |_|                   ',
] as const;

function writeLine(line = ''): void {
    process.stdout.write(`${line}\n`);
}

function renderBanner(): void {
    writeLine();
    for (const line of NGCOMPASS_BANNER) {
        writeLine(pc.red(line));
    }
    writeLine();
}

function severityBadge(severity: string): string {
    switch (severity) {
        case 'error':
            return pc.red(pc.bold('error'));
        case 'warn':
            return pc.yellow('warn ');
        default:
            return pc.dim(severity.padEnd(5));
    }
}

export interface RulesReporterOptions {
    preset?: string;
}

export class RulesReporter {
    constructor(private readonly options: RulesReporterOptions = {}) {}

    render(entries: RuleListEntry[]): void {
        const filtered = this.options.preset
            ? entries.filter((entry) => entry.presets.includes(this.options.preset!))
            : entries;

        const grouped = new Map<string, RuleListEntry[]>();
        for (const entry of filtered) {
            const group = grouped.get(entry.domain) ?? [];
            group.push(entry);
            grouped.set(entry.domain, group);
        }

        const sortedDomains = [...grouped.keys()].sort(
            (a, b) =>
                (DOMAIN_ORDER.indexOf(a) === -1 ? 99 : DOMAIN_ORDER.indexOf(a)) -
                (DOMAIN_ORDER.indexOf(b) === -1 ? 99 : DOMAIN_ORDER.indexOf(b))
        );

        renderBanner();

        const indexWidth = String(filtered.length).length;
        let index = 1;

        for (const domain of sortedDomains) {
            const rules = grouped.get(domain) ?? [];

            for (const rule of rules) {
                const label = pc.dim(`${String(index).padStart(indexWidth, ' ')}.`);
                const badge = severityBadge(rule.severity);
                writeLine(`${label} ${badge}  ${pc.white(rule.name)}  ${pc.dim(domain)}`);
                index++;
            }
        }
    }

    renderSingleRule(rule: RuleListEntry): void {
        renderBanner();
        writeLine(`Rule:        ${pc.white(pc.bold(rule.name))}`);
        writeLine(`Description: ${pc.dim(rule.description)}`);
        writeLine(`Domain:      ${pc.magenta(rule.domain)}`);
        writeLine(`Severity:    ${severityBadge(rule.severity)}`);

        if (rule.presets.length > 0) {
            writeLine(`Presets:     ${pc.cyan(rule.presets.join(', '))}`);
        }
        writeLine();
    }
}
