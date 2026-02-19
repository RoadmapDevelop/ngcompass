import pc from 'picocolors';
import {
    type HealthReport,
    type InitResult,
    type ConfigIssue,
    PACKAGE_VERSION,
    type ConfigReport,
} from '@ngcompass/common';
import type { ConfigReporter } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';

function formatPath(pathSegments?: (string | number)[]): string {
    if (!pathSegments || pathSegments.length === 0) return '';
    return pathSegments
        .map(s => (typeof s === 'number' ? `[${s}]` : s))
        .join('.')
        .replace(/\.\[/g, '[');
}

function formatIssue(issue: ConfigIssue): string {
    const label = issue.severity === 'error' ? pc.red('error') : pc.yellow('warn');
    const pathStr = formatPath(issue.path);
    const pathInfo = pathStr ? ` ${pc.gray(`at ${pathStr}`)}` : '';
    const codeInfo = issue.code ? ` ${pc.dim(issue.code)}` : '';

    let output = `${label} ${issue.message}${pathInfo}${codeInfo}`;
    if (issue.suggestion) {
        output += `\n          ${pc.cyan('→')} ${pc.dim(issue.suggestion)}`;
    }
    return output;
}

export class TextConfigReporter implements ConfigReporter {
    constructor(private readonly out: ReporterOutput = processOutput) { }

    report(report: ConfigReport): void {
        if (!report.valid) {
            this.out.error(pc.red('✗ Configuration validation failed'));
            for (const issue of report.issues) {
                const pathStr = formatPath(issue.path) || 'root';
                this.out.error(`  [${issue.severity.toUpperCase()}] ${pathStr}: ${issue.message}`);
            }
        }
    }

    renderInitResult(result: InitResult): void {
        if (result.success) {
            this.out.write(`${pc.green('✔')} ${result.filePath}`);
        } else if (result.alreadyExists) {
            this.out.write(`${pc.yellow('◆')} ${result.filePath} ${pc.gray('(exists)')}`);
        } else {
            this.out.error(`${pc.red('✘')} initialization failed`);
        }
    }

    renderHealthReport(report: HealthReport): void {
        this.renderHeader();
        this.renderIssues(report);
        this.renderSummary(report);
    }

    private renderHeader(): void {
        this.out.write(`${pc.bold('ngcompass')} ${pc.gray(PACKAGE_VERSION)}`);
    }

    private renderIssues(report: HealthReport): void {
        if (!report.issues || report.issues.length === 0) return;

        const byFile = new Map<string, ConfigIssue[]>();
        for (const issue of report.issues) {
            const file = issue.file ?? 'unknown';
            let bucket = byFile.get(file);
            if (!bucket) {
                bucket = [];
                byFile.set(file, bucket);
            }
            bucket.push(issue);
        }

        this.out.write('');

        for (const [file, issues] of byFile) {
            if (file !== 'unknown') this.out.write(pc.underline(file));
            for (const issue of issues) {
                const loc = issue.line ? `${issue.line}:${issue.column ?? 1}` : '';
                const locLabel = loc ? pc.gray(loc.padEnd(8)) : '';
                this.out.write(`  ${locLabel}  ${formatIssue(issue)}`);
            }
            this.out.write('');
        }
    }

    private renderSummary(report: HealthReport): void {
        const errors = report.issues.filter(i => i.severity === 'error');
        const warnings = report.issues.filter(i => i.severity === 'warning');

        if (errors.length === 0 && warnings.length === 0) {
            this.out.write(`${pc.green('No issues found.')} ${pc.bold('status')} ${pc.green('OK')}`);
            return;
        }

        const parts: string[] = [];
        if (errors.length) parts.push(pc.red(`${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`));
        if (warnings.length) parts.push(pc.yellow(`${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`));

        const statusLabel = errors.length > 0 ? pc.bold(pc.red('ERROR')) : pc.bold(pc.yellow('WARN'));
        const total = errors.length + warnings.length;
        this.out.write(`Found ${total} issue${total !== 1 ? 's' : ''} (${parts.join(', ')}) status ${statusLabel}`);
    }
}
