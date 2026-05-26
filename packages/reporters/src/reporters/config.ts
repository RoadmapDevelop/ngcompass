import pc from 'picocolors';
import {
  pluralise,
  type ConfigIssue,
  type ConfigReport,
  type HealthReport,
  type InitResult,
} from '@ngcompass/common';
import { processOutput, type ReporterOutput } from '../output.js';
import type { ConfigReporter } from '../types.js';

const LOCATION_COLUMN_WIDTH = 6;

const SEVERITY_COLUMN_WIDTH = 5;

function formatPath(pathSegments?: readonly (string | number)[]): string {
  if (!pathSegments || pathSegments.length === 0) return '';
  return pathSegments
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace(/\.\[/g, '[');
}

function formatIssue(issue: ConfigIssue, suggestionIndent: string): string {
  const rawLabel = issue.severity === 'error' ? 'error' : 'warn';
  const label =
    issue.severity === 'error'
      ? pc.red(rawLabel.padEnd(SEVERITY_COLUMN_WIDTH))
      : pc.yellow(rawLabel.padEnd(SEVERITY_COLUMN_WIDTH));
  const pathStr = formatPath(issue.path);
  const pathInfo = pathStr ? ` ${pc.gray(`at ${pathStr}`)}` : '';
  const codeInfo = issue.code ? ` ${pc.dim(issue.code)}` : '';

  let output = `${label}  ${issue.message}${pathInfo}${codeInfo}`;
  if (issue.suggestion) {
    output += `\n${suggestionIndent}${pc.cyan('→')} ${pc.dim(issue.suggestion)}`;
  }
  return output;
}

function groupIssuesByFile(
  issues: readonly ConfigIssue[]
): Map<string, ConfigIssue[]> {
  const map = new Map<string, ConfigIssue[]>();
  for (const issue of issues) {
    const file = issue.file ?? 'unknown';
    const existing = map.get(file);
    if (existing) existing.push(issue);
    else map.set(file, [issue]);
  }
  return map;
}

function partitionIssuesBySeverity(issues: readonly ConfigIssue[]): {
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
} {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];

  for (const issue of issues) {
    if (issue.severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return { errors, warnings };
}

export class TextConfigReporter implements ConfigReporter {
  constructor(private readonly out: ReporterOutput = processOutput) {}

  reportConfig(report: ConfigReport): void {
    if (report.valid) return;

    this.out.error(pc.red('x Configuration validation failed'));
    for (const issue of report.issues) {
      const pathStr = formatPath(issue.path) || 'root';
      const tag =
        issue.severity === 'error'
          ? pc.bold(pc.red('[ERROR]'))
          : pc.bold(pc.yellow('[WARNING]'));
      this.out.error(`${tag} ${pc.dim(pathStr + ':')} ${issue.message}`);
    }
  }

  renderInitResult(result: InitResult): void {
    if (result.success) {
      this.out.write(`${pc.green('Created')} ${result.filePath}`);
      this.out.write(
        pc.dim('Next: run `ngcompass analyze` to scan this project.')
      );
    } else if (result.alreadyExists) {
      this.out.write(`${pc.yellow('Already exists')} ${result.filePath}`);
      this.out.write(pc.dim('Use `ngcompass init --force` to overwrite it.'));
    } else {
      this.out.error(`${pc.red('x')} initialization failed`);
      this.out.error(
        pc.dim(
          'Check file permissions or pass `--cwd <path>` to choose a project directory.'
        )
      );
    }
  }

  renderHealthReport(report: HealthReport): void {
    this.renderIssues(report);
    this.renderSummary(report);
  }

  private renderIssues(report: HealthReport): void {
    if (report.issues.length === 0) return;

    const byFile = groupIssuesByFile(report.issues);

    this.out.write('');

    for (const [file, issues] of byFile) {
      if (file !== 'unknown') this.out.write(pc.underline(file));

      for (const issue of issues) {
        const location = issue.line ? `${issue.line}:${issue.column ?? 1}` : '';
        const locationPrefix = location
          ? `${pc.gray(location.padEnd(LOCATION_COLUMN_WIDTH))}  `
          : '';
        const suggestionIndent = ' '.repeat(
          location
            ? LOCATION_COLUMN_WIDTH + 2 + SEVERITY_COLUMN_WIDTH + 2
            : SEVERITY_COLUMN_WIDTH + 2
        );

        this.out.write(
          `${locationPrefix}${formatIssue(issue, suggestionIndent)}`
        );
      }

      this.out.write('');
    }
  }

  private renderSummary(report: HealthReport): void {
    const { errors, warnings } = partitionIssuesBySeverity(report.issues);
    const isHealthy = errors.length === 0 && warnings.length === 0;

    if (isHealthy) {
      this.out.write(`${pc.green('Configuration OK.')} No issues found.`);
      return;
    }

    const parts: string[] = [];
    if (errors.length)
      parts.push(
        pc.red(`${errors.length} ${pluralise(errors.length, 'error')}`)
      );
    if (warnings.length)
      parts.push(
        pc.yellow(`${warnings.length} ${pluralise(warnings.length, 'warning')}`)
      );

    const statusLabel =
      errors.length > 0 ? pc.bold(pc.red('ERROR')) : pc.bold(pc.yellow('WARN'));
    const total = errors.length + warnings.length;
    this.out.write(
      `Found ${total} ${pluralise(total, 'issue')} (${parts.join(', ')}) status ${statusLabel}`
    );
  }
}
