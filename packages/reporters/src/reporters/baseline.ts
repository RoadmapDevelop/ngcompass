import process from 'node:process';
import pc from 'picocolors';
import type { BaselineReport, BaselineRuleSummary } from '@ngcompass/common';
import { buildLabeledDivider } from '../formatting/blocks.js';
import { processOutput } from '../formatting/output.js';
import type { BaselineReporter, ReporterOutput } from '../models/index.js';

const DEFAULT_WIDTH = 80;
const MIN_WIDTH = 40;
const SHARE_WIDTH = 6;
const COLUMN_GAP = 2;
const FULL_BLOCK = '█';
const HALF_BLOCK = '▌';

export class TextBaselineReporter implements BaselineReporter {
  constructor(private readonly out: ReporterOutput = processOutput) {}

  renderBaseline(report: BaselineReport): void {
    this.out.write('');
    this.out.write(pc.dim(report.path));

    if (report.totalViolations === 0) {
      this.out.write(pc.bold('Baseline is empty'));
      this.out.write('');
      return;
    }

    this.out.write('');
    this.out.write(buildLabeledDivider('Baseline', 'muted'));

    for (const rule of report.rules) {
      this.renderRuleBlock(rule, terminalWidth());
    }

    this.out.write('');
    this.out.write(pc.bold(buildSummaryLine(report)));
    this.out.write(
      pc.dim('Run `ngcompass baseline prune` to drop entries that are fixed.')
    );
    this.out.write('');
  }

  private renderRuleBlock(rule: BaselineRuleSummary, width: number): void {
    this.out.write('');
    this.out.write(
      alignEnds(
        pc.bold(rule.ruleName),
        rule.ruleName,
        pc.cyan(pc.bold(String(rule.total))),
        String(rule.total),
        width
      )
    );

    const bar = buildBar(rule.share, width - SHARE_WIDTH - COLUMN_GAP);
    const share = formatShare(rule.share).padStart(SHARE_WIDTH);

    this.out.write('');
    this.out.write(alignEnds(pc.cyan(bar), bar, pc.dim(share), share, width));
    this.out.write('');

    this.renderFiles(rule, width);
  }

  private renderFiles(rule: BaselineRuleSummary, width: number): void {
    const showCounts = rule.files.some((file) => file.count > 1);
    const countWidth = showCounts ? widestCount(rule) + COLUMN_GAP : 0;

    for (const file of rule.files) {
      const shortened = shortenPath(file.filePath, width - countWidth);
      if (!showCounts) {
        this.out.write(pc.dim(shortened));
        continue;
      }

      const count = String(file.count);
      this.out.write(
        alignEnds(pc.dim(shortened), shortened, pc.cyan(count), count, width)
      );
    }

    if (rule.omittedFiles > 0) {
      this.out.write(
        pc.dim(
          `+ ${rule.omittedFiles.toLocaleString()} more ${rule.omittedFiles === 1 ? 'file' : 'files'}`
        )
      );
    }
  }
}

function alignEnds(
  left: string,
  leftPlain: string,
  right: string,
  rightPlain: string,
  width: number
): string {
  const gap = Math.max(1, width - leftPlain.length - rightPlain.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

function widestCount(rule: BaselineRuleSummary): number {
  let widest = 0;
  for (const file of rule.files) {
    widest = Math.max(widest, String(file.count).length);
  }
  return widest;
}

function buildSummaryLine(report: BaselineReport): string {
  const violations = plural(report.totalViolations, 'violation');
  const files = plural(report.totalFiles, 'file');
  const rules = plural(report.rules.length, 'rule');

  return (
    `${pc.cyan(violations)} hidden across ${files} ${pc.dim('·')} ${rules}  ` +
    pc.cyan(pc.bold('BASELINE'))
  );
}

function buildBar(share: number, maxWidth: number): string {
  const exact = share * maxWidth;
  const full = Math.floor(exact);
  const bar = FULL_BLOCK.repeat(full) + (exact - full >= 0.5 ? HALF_BLOCK : '');

  return bar.length > 0 ? bar : HALF_BLOCK;
}

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function terminalWidth(): number {
  return Math.max(MIN_WIDTH, process.stdout.columns ?? DEFAULT_WIDTH);
}

function shortenPath(filePath: string, maxLength: number): string {
  if (filePath.length <= maxLength) return filePath;

  const segments = filePath.split('/');
  const fileName = segments[segments.length - 1];
  const shortened = `${segments[0]}/…/${fileName}`;

  if (shortened.length <= maxLength) return shortened;
  if (fileName.length <= maxLength) return fileName;

  return `…${fileName.slice(fileName.length - maxLength + 1)}`;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}
