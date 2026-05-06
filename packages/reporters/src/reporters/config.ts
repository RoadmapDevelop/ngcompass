import pc from 'picocolors';
import {
    type HealthReport,
    type InitResult,
    type ConfigIssue,
    type ConfigReport,
} from '@ngcompass/common';
import type { ConfigReporter } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';

/** Minimum column width reserved for a `"line:col"` location label. */
const LOCATION_COLUMN_WIDTH = 6;

/** Width reserved for the severity label before the issue message. */
const SEVERITY_COLUMN_WIDTH = 5;

// ---------------------------------------------------------------------------
// Pure formatting helpers
// ---------------------------------------------------------------------------

/**
 * Converts an optional path segment array (e.g. `['rules', 0, 'severity']`) to a
 * human-readable dot-bracket string (`'rules[0].severity'`).
 *
 * Returns an empty string when `pathSegments` is absent or empty, allowing callers
 * to omit the "at <path>" clause cleanly.
 */
function formatPath(pathSegments?: readonly (string | number)[]): string {
    if (!pathSegments || pathSegments.length === 0) return '';
    return pathSegments
        .map(segment => (typeof segment === 'number' ? `[${segment}]` : segment))
        .join('.')
        .replace(/\.\[/g, '[');
}

/**
 * Formats a config issue into a coloured, optionally multi-line string.
 *
 * Single source of truth for issue presentation, used by both `reportConfig()`
 * and `renderIssues()` to avoid duplicated formatting logic.
 */
function formatIssue(issue: ConfigIssue, suggestionIndent: string): string {
    const rawLabel = issue.severity === 'error' ? 'error' : 'warn';
    const label = issue.severity === 'error'
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

/**
 * Returns the correct plural form of `word` based on `count`.
 *
 * Handles only the simple English `-s` plural; extend if irregular nouns are needed.
 */
function pluralise(count: number, word: string): string {
    return count === 1 ? word : `${word}s`;
}

/**
 * Groups a flat array of `ConfigIssue` objects by their source file path.
 *
 * Issues without a `file` property are placed under the `'unknown'` key.
 * Pure function, no rendering, no side effects.
 */
function groupIssuesByFile(issues: readonly ConfigIssue[]): Map<string, ConfigIssue[]> {
    return issues.reduce<Map<string, ConfigIssue[]>>((map, issue) => {
        const file = issue.file ?? 'unknown';
        const existing = map.get(file) ?? [];
        return map.set(file, [...existing, issue]);
    }, new Map());
}

/**
 * Separates a flat issue list into error and warning buckets.
 *
 * Extracted to avoid filtering the issues array twice in `renderSummary` (DRY).
 * Pure function, returns a plain object, no I/O.
 */
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

// ---------------------------------------------------------------------------
// TextConfigReporter
// ---------------------------------------------------------------------------

export class TextConfigReporter implements ConfigReporter {
    constructor(private readonly out: ReporterOutput = processOutput) { }

    /**
     * Renders configuration validation errors.
     * Only produces output when the config is invalid; succeeds silently.
     *
     * @param report - The validation result from the config loader.
     */
    reportConfig(report: ConfigReport): void {
        if (report.valid) return;

        this.out.error(pc.red('x Configuration validation failed'));
        for (const issue of report.issues) {
            const pathStr = formatPath(issue.path) || 'root';
            const tag = issue.severity === 'error'
                ? pc.bold(pc.red('[ERROR]'))
                : pc.bold(pc.yellow('[WARNING]'));
            this.out.error(`${tag} ${pc.dim(pathStr + ':')} ${issue.message}`);
        }
    }

    /**
     * Renders the outcome of `compass init`.
     *
     * @param result - The init operation result (success, already-exists, or failure).
     */
    renderInitResult(result: InitResult): void {
        if (result.success) {
            this.out.write(`${pc.green('Created')} ${result.filePath}`);
            this.out.write(pc.dim('Next: run `ngcompass analyze` to scan this project.'));
        } else if (result.alreadyExists) {
            this.out.write(`${pc.yellow('Already exists')} ${result.filePath}`);
            this.out.write(pc.dim('Use `ngcompass init --force` to overwrite it.'));
        } else {
            this.out.error(`${pc.red('x')} initialization failed`);
            this.out.error(pc.dim('Check file permissions or pass `--cwd <path>` to choose a project directory.'));
        }
    }

    /**
     * Renders the full project health report.
     *
     * @param report - Aggregated health issues, one per config concern.
     */
    renderHealthReport(report: HealthReport): void {
        this.renderIssues(report);
        this.renderSummary(report);
    }

    private renderIssues(report: HealthReport): void {
        if (report.issues.length === 0) return;

        // Group by file using a pure helper to keep the render path predictable.
        const byFile = groupIssuesByFile(report.issues);

        this.out.write('');

        for (const [file, issues] of byFile) {
            if (file !== 'unknown') this.out.write(pc.underline(file));

            for (const issue of issues) {
                const location = issue.line ? `${issue.line}:${issue.column ?? 1}` : '';
                const locationPrefix = location
                    ? `${pc.gray(location.padEnd(LOCATION_COLUMN_WIDTH))}  `
                    : '';
                const suggestionIndent = ' '.repeat(location
                    ? LOCATION_COLUMN_WIDTH + 2 + SEVERITY_COLUMN_WIDTH + 2
                    : SEVERITY_COLUMN_WIDTH + 2);

                this.out.write(`${locationPrefix}${formatIssue(issue, suggestionIndent)}`);
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
        if (errors.length) parts.push(pc.red(`${errors.length} ${pluralise(errors.length, 'error')}`));
        if (warnings.length) parts.push(pc.yellow(`${warnings.length} ${pluralise(warnings.length, 'warning')}`));

        const statusLabel = errors.length > 0 ? pc.bold(pc.red('ERROR')) : pc.bold(pc.yellow('WARN'));
        const total = errors.length + warnings.length;
        this.out.write(`Found ${total} ${pluralise(total, 'issue')} (${parts.join(', ')}) status ${statusLabel}`);
    }
}
