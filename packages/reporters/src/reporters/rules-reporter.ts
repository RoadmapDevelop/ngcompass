/**
 * @fileoverview
 * Renderer for the `ngcompass rules` command.
 *
 * Outputs the catalog of registered rules grouped by domain, optionally
 * filtered by preset. A second entry point, `renderSingleRule`, renders the
 * detail view shown when the user runs `ngcompass rules <name>`. Both paths
 * go through `ReporterOutput` so tests can assert on the captured lines.
 */

import pc from 'picocolors';
import type { RuleListEntry } from '@ngcompass/common';
import { processOutput, type ReporterOutput } from '../output.js';

/** Canonical display order of rule domains. */
const DOMAIN_ORDER = [
    'correctness',
    'performance',
    'security',
    'ssr',
    'reactivity',
    'modern-api',
    'template',
    'testing',
] as const;

/** ASCII banner shown at the top of every `rules` listing. */
const NGCOMPASS_BANNER = [
    ' _ __   __ _  ___ ___  _ __ ___  _ __   __ _ ___ ___ ',
    "| '_ \\ / _` |/ __/ _ \\| '_ ` _ \\| '_ \\ / _` / __/ __|",
    '| | | | (_| | (_| (_) | | | | | | |_) | (_| \\__ \\__ \\',
    '|_| |_|\\__, |\\___\\___/|_| |_| |_| .__/ \\__,_|___/___/',
    '       |___/                    |_|                   ',
] as const;

export interface RulesReporterOptions {
    /** Optional preset filter; only rules opted into `presets[<this>]` are listed. */
    preset?: string;
}

export class RulesReporter {
    constructor(
        private readonly options: RulesReporterOptions = {},
        private readonly out: ReporterOutput = processOutput,
    ) {}

    /** Renders every rule that survives the optional preset filter. */
    render(entries: RuleListEntry[]): void {
        const filtered = this.options.preset
            ? entries.filter((entry) => entry.presets.includes(this.options.preset!))
            : entries;

        const grouped = groupByDomain(filtered);
        const sortedDomains = sortDomains([...grouped.keys()]);

        this.renderBanner();

        const indexWidth = String(filtered.length).length;
        let index = 1;
        for (const domain of sortedDomains) {
            for (const rule of grouped.get(domain) ?? []) {
                const label = pc.dim(`${String(index).padStart(indexWidth, ' ')}.`);
                const badge = severityBadge(rule.severity);
                this.out.write(`${label} ${badge}  ${pc.white(rule.name)}  ${pc.dim(domain)}`);
                index++;
            }
        }
    }

    /** Renders the detail view for a single rule. */
    renderSingleRule(rule: RuleListEntry): void {
        this.renderBanner();
        this.out.write(`Rule:        ${pc.white(pc.bold(rule.name))}`);
        this.out.write(`Description: ${pc.dim(rule.description)}`);
        this.out.write(`Domain:      ${pc.magenta(rule.domain)}`);
        this.out.write(`Severity:    ${severityBadge(rule.severity)}`);

        if (rule.presets.length > 0) {
            this.out.write(`Presets:     ${pc.cyan(rule.presets.join(', '))}`);
        }
        this.out.write('');
    }

    private renderBanner(): void {
        this.out.write('');
        for (const line of NGCOMPASS_BANNER) {
            this.out.write(pc.red(line));
        }
        this.out.write('');
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────

/** Buckets `entries` by their `domain` field, preserving insertion order. */
function groupByDomain(entries: ReadonlyArray<RuleListEntry>): Map<string, RuleListEntry[]> {
    const grouped = new Map<string, RuleListEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.domain);
        if (group) group.push(entry);
        else grouped.set(entry.domain, [entry]);
    }
    return grouped;
}

/** Sorts domains by the canonical `DOMAIN_ORDER`; unknown domains go last. */
function sortDomains(domains: ReadonlyArray<string>): string[] {
    const rank = (d: string): number => {
        const idx = DOMAIN_ORDER.indexOf(d as typeof DOMAIN_ORDER[number]);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    return [...domains].sort((a, b) => rank(a) - rank(b));
}

/** Formats a severity value as a coloured, fixed-width badge. */
function severityBadge(severity: string): string {
    switch (severity) {
        case 'error': return pc.red(pc.bold('error'));
        case 'warn':  return pc.yellow('warn ');
        default:      return pc.dim(severity.padEnd(5));
    }
}
