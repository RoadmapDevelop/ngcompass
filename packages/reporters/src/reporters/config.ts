import pc from 'picocolors';
import { type HealthReport, type InitResult, type ConfigIssue, PACKAGE_VERSION } from '@ngcompass/common';
import type { ConfigReporter } from '../types.js';

const formatPath = (path?: (string | number)[]): string => {
    if (!path || path.length === 0) return '';
    return path.map(segment => (typeof segment === 'number' ? `[${segment}]` : segment)).join('.').replace(/\.\[/g, '[');
};

const formatIssue = (issue: ConfigIssue): string => {
    const label = issue.severity === 'error' ? pc.red('error') : pc.yellow('warn');
    const path = formatPath(issue.path);
    const pathInfo = path ? ` ${pc.gray(`at ${path}`)}` : '';
    const codeInfo = pc.dim(issue.code);

    let output = `${label} ${issue.message}${pathInfo} ${codeInfo}`;

    // Add suggestion if available
    if (issue.suggestion) {
        output += `\n          ${pc.cyan('→')} ${pc.dim(issue.suggestion)}`;
    }

    return output;
};

const renderHeader = () => {
    console.log(`${pc.bold('ngcompass')} ${pc.gray(PACKAGE_VERSION)}`);
};

const renderIssues = (report: HealthReport) => {
    if (report.issues.length === 0) return;

    // Group issues by file
    const issuesByFile = new Map<string, ConfigIssue[]>();
    for (const issue of report.issues) {
        const file = issue.file || 'unknown';
        const list = issuesByFile.get(file) || [];
        list.push(issue);
        issuesByFile.set(file, list);
    }

    console.log('');

    for (const [file, issues] of issuesByFile) {
        // Render file header (clickable in VSCode)
        if (file !== 'unknown') {
            console.log(pc.underline(file));
        }

        issues.forEach((issue) => {
            const loc = issue.line ? `${issue.line}:${issue.column || 1}` : '';
            const locLabel = loc ? pc.gray(loc.padEnd(6)) : '';
            console.log(`  ${locLabel}  ${formatIssue(issue)}`);
        });
        console.log('');
    }
};

const renderSummary = (report: HealthReport) => {
    const errors = report.issues.filter(i => i.severity === 'error');
    const warnings = report.issues.filter(i => i.severity === 'warning');

    if (errors.length === 0 && warnings.length === 0) {
        console.log(`${pc.green('No issues found .')} ${pc.bold('status')} ${pc.green('OK')}`);
        return;
    }

    const foundParts: string[] = [];

    if (errors.length > 0) {
        const label = errors.length === 1 ? 'error' : 'errors';
        foundParts.push(pc.red(`${errors.length} ${label}`));
    }

    if (warnings.length > 0) {
        const label = warnings.length === 1 ? 'warning' : 'warnings';
        foundParts.push(pc.yellow(`${warnings.length} ${label}`));
    }

    const foundText = foundParts.join(' , ');
    const statusLabel = errors.length > 0 ? pc.red('ERROR') : pc.yellow('WARN');
    const total = errors.length + warnings.length;

    console.log(`Found ${total} issues ( ${foundText} ) status ${statusLabel}`);
};

export const TextConfigReporter: ConfigReporter = {
    renderHealthReport(report: HealthReport) {
        renderHeader();
        renderIssues(report);
        renderSummary(report);
    },

    renderInitResult(result: InitResult) {
        if (result.success) {
            console.log(`${pc.green('✔')} ${result.filePath}`);
        } else if (result.alreadyExists) {
            console.log(`${pc.yellow('◆')} ${result.filePath} ${pc.gray('(exists)')}`);
        } else {
            console.error(`${pc.red('✘')} initialization failed`);
        }
    }
};