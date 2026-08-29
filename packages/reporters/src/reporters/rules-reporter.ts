import pc from 'picocolors';
import type { RuleListEntry } from '@ngcompass/common';
import { processOutput } from '../formatting/output.js';
import type { ReporterOutput } from '../models/index.js';
import type { RulesReporterOptions } from '../models/index.js';

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

const NGCOMPASS_BANNER = [
  ' _ __   __ _  ___ ___  _ __ ___  _ __   __ _ ___ ___ ',
  "| '_ \\ / _` |/ __/ _ \\| '_ ` _ \\| '_ \\ / _` / __/ __|",
  '| | | | (_| | (_| (_) | | | | | | |_) | (_| \\__ \\__ \\',
  '|_| |_|\\__, |\\___\\___/|_| |_| |_| .__/ \\__,_|___/___/',
  '       |___/                    |_|                   ',
] as const;

export class RulesReporter {
  constructor(
    private readonly options: RulesReporterOptions = {},
    private readonly out: ReporterOutput = processOutput
  ) {}

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
        this.out.write(
          `${label} ${badge}  ${pc.white(rule.name)}  ${pc.dim(domain)}`
        );
        index++;
      }
    }
  }

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

function groupByDomain(
  entries: ReadonlyArray<RuleListEntry>
): Map<string, RuleListEntry[]> {
  const grouped = new Map<string, RuleListEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.domain);
    if (group) group.push(entry);
    else grouped.set(entry.domain, [entry]);
  }
  return grouped;
}

function sortDomains(domains: ReadonlyArray<string>): string[] {
  const rank = (d: string): number => {
    const idx = DOMAIN_ORDER.findIndex((domain) => domain === d);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  return [...domains].sort((a, b) => rank(a) - rank(b));
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
