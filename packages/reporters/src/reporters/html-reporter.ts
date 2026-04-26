import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import type { RuleResult, RuleFailure } from '@ngcompass/common';
import type { Reporter, ResultSummary, ParseError } from '../types.js';
import { isErrorSeverity, severityRank, compareByPosition } from '../severity-utils.js';
import { processOutput, type ReporterOutput } from '../output.js';

const DEFAULT_OUTPUT_PATH = 'ngcompass-report.html';
const SEVERITY_ORDER = ['critical', 'high', 'error', 'moderate', 'warning', 'low', 'info', 'hint'] as const;

type SeverityCount = Partial<Record<(typeof SEVERITY_ORDER)[number] | string, number>>;

type FileBucket = {
    filePath: string;
    relativePath: string;
    failures: RuleFailure[];
    errorCount: number;
    warningCount: number;
    dominantSeverity: string;
};

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function relativeToRoot(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function openInBrowser(filePath: string): void {
    const abs = path.resolve(filePath);
    const [cmd, args] = process.platform === 'win32'
        ? (['cmd', ['/c', 'start', '', abs]] as const)
        : process.platform === 'darwin'
            ? (['open', [abs]] as const)
            : (['xdg-open', [abs]] as const);
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

function formatTimestamp(date: Date): string {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function severityColorClass(severity: string): string {
    switch (severity) {
        case 'critical': return 'sev-critical';
        case 'high': return 'sev-high';
        case 'error': return 'sev-error';
        case 'moderate': return 'sev-moderate';
        case 'warning': return 'sev-warning';
        case 'low': return 'sev-low';
        case 'info': return 'sev-info';
        case 'hint': return 'sev-hint';
        default: return 'sev-info';
    }
}

function humanSeverity(severity: string): string {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function collectFailures(results: ReadonlyArray<RuleResult>): RuleFailure[] {
    return results.flatMap((result) => result.failures);
}

function bucketFiles(results: ReadonlyArray<RuleResult>): FileBucket[] {
    const grouped = new Map<string, RuleFailure[]>();

    for (const result of results) {
        for (const failure of result.failures) {
            const list = grouped.get(failure.filePath);
            if (list) {
                list.push(failure);
            } else {
                grouped.set(failure.filePath, [failure]);
            }
        }
    }

    return [...grouped.entries()]
        .map(([filePath, failures]) => {
            const sortedFailures = [...failures].sort((a, b) => {
                const severityDiff = severityRank(a.severity) - severityRank(b.severity);
                if (severityDiff !== 0) return severityDiff;
                const ruleDiff = a.ruleName.localeCompare(b.ruleName);
                if (ruleDiff !== 0) return ruleDiff;
                return compareByPosition(a, b);
            });

            const errorCount = sortedFailures.filter((failure) => isErrorSeverity(failure.severity)).length;
            const warningCount = sortedFailures.length - errorCount;
            const dominantSeverity = sortedFailures[0]?.severity ?? 'info';

            return {
                filePath,
                relativePath: relativeToRoot(filePath),
                failures: sortedFailures,
                errorCount,
                warningCount,
                dominantSeverity,
            } satisfies FileBucket;
        })
        .sort((a, b) => {
            if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
            if (b.failures.length !== a.failures.length) return b.failures.length - a.failures.length;
            return a.relativePath.localeCompare(b.relativePath);
        });
}

function summarizeSeverities(failures: ReadonlyArray<RuleFailure>): SeverityCount {
    const counts: SeverityCount = {};
    for (const failure of failures) {
        counts[failure.severity] = (counts[failure.severity] ?? 0) + 1;
    }
    return counts;
}

function summarizeRules(failures: ReadonlyArray<RuleFailure>): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const failure of failures) {
        counts.set(failure.ruleName, (counts.get(failure.ruleName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function angularLogo(): string {
    return `
<svg viewBox="0 0 256 271" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M128 0L0 45.6l19.5 169.4L128 271l108.5-56L256 45.6 128 0Z" fill="#DD0031"/>
  <path d="M128 0v30.1-.1V271l108.5-56L256 45.6 128 0Z" fill="#C3002F"/>
  <path d="M128 31.3 48 210.3h29.8l16.1-40.4h68.1l16.1 40.4H208L128 31.3Zm23.6 113.9h-47.2L128 88.4l23.6 56.8Z" fill="#fff"/>
</svg>`;
}

function iconSearch(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 18a7.5 7.5 0 1 1 5.27-12.84A7.5 7.5 0 0 1 10.5 18Zm0-13a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Zm11 15-4.35-4.35" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconChevron(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconFile(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Zm0 0v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconAlert(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.7 3.86a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconWarning(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function buildStyles(): string {
    return `
:root {
  color-scheme: light;
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
  --destructive-soft: 0 86% 97%;
  --destructive-border: 0 93% 88%;
  --warning: 38 92% 50%;
  --warning-soft: 48 96% 96%;
  --warning-border: 45 93% 85%;
  --success: 142 71% 45%;
  --success-soft: 138 76% 96%;

  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 5.5%;
    --card-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --destructive: 0 72% 55%;
    --destructive-foreground: 0 0% 98%;
    --destructive-soft: 0 63% 15%;
    --destructive-border: 0 63% 25%;
    --warning: 38 92% 55%;
    --warning-soft: 38 50% 12%;
    --warning-border: 38 50% 22%;
    --success: 142 71% 50%;
    --success-soft: 142 40% 12%;
  }
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  font: 14px/1.5 var(--font-sans);
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
button, input { font: inherit; color: inherit; }
a { color: inherit; }

.page {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-size: 14px;
}
.brand svg { width: 22px; height: 22px; flex: 0 0 auto; }

.topbar-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.topbar-meta .sep {
  width: 3px; height: 3px; border-radius: 999px;
  background: hsl(var(--muted-foreground) / 0.4);
}

.hero {
  display: grid;
  gap: 20px;
  margin-bottom: 24px;
}

.hero-copy { display: grid; gap: 8px; }

.hero-title {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: hsl(var(--foreground));
}

.hero-subtitle {
  color: hsl(var(--muted-foreground));
  font-size: 15px;
  max-width: 72ch;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
  width: fit-content;
}
.status-indicator.pass {
  background: hsl(var(--success-soft));
  color: hsl(var(--success));
  border-color: hsl(var(--success) / 0.25);
}
.status-indicator.fail {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive-border));
}
.status-indicator::before {
  content: '';
  width: 6px; height: 6px; border-radius: 999px;
  background: currentColor;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
}

.stat-card {
  padding: 16px 18px;
  display: grid;
  gap: 4px;
}

.stat-label {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: hsl(var(--foreground));
}
.stat-value.destructive { color: hsl(var(--destructive)); }
.stat-value.warning { color: hsl(var(--warning)); }

.content { display: grid; gap: 20px; }

.summary-strip {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 16px;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: -0.01em;
}

.card-sub {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.card-body {
  padding: 12px 18px 18px;
}

.severity-list { display: grid; gap: 2px; }

.severity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius);
}
.severity-row:hover { background: hsl(var(--muted) / 0.6); }

.severity-row .left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: currentColor;
}

.severity-name {
  font-weight: 500;
  text-transform: capitalize;
  color: hsl(var(--foreground));
  font-size: 13px;
}

.severity-count {
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.rule-list { display: grid; gap: 12px; }

.rule-item { display: grid; gap: 6px; }
.rule-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.rule-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: hsl(var(--foreground));
  font: 12px/1.4 var(--font-mono);
}
.rule-count {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.rule-bar {
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--muted));
  overflow: hidden;
}
.rule-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: hsl(var(--foreground) / 0.6);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.searchbox {
  position: relative;
  flex: 1 1 320px;
  min-width: 0;
}
.searchbox svg {
  position: absolute;
  left: 10px;
  top: 50%;
  width: 15px;
  height: 15px;
  transform: translateY(-50%);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}
.searchbox input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 34px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--input));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  outline: none;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.searchbox input::placeholder { color: hsl(var(--muted-foreground)); }
.searchbox input:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.15);
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  height: 36px;
  border-radius: var(--radius);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.btn:hover {
  background: hsl(var(--accent));
}
.btn.is-active {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.btn.btn-ghost {
  border-color: transparent;
  background: transparent;
  color: hsl(var(--muted-foreground));
}
.btn.btn-ghost:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 0;
}
.section-title {
  color: hsl(var(--foreground));
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.section-sub {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.file-list { display: grid; gap: 8px; }

.file-card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.file-card:hover { border-color: hsl(var(--border) / 1.4); }

.file-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.file-header:hover { background: hsl(var(--muted) / 0.4); }

.file-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.file-icon {
  width: 16px;
  height: 16px;
  color: hsl(var(--muted-foreground));
  flex: 0 0 auto;
}
.chevron {
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
  transition: transform 0.18s ease;
  flex: 0 0 auto;
}
.file-card.is-open .chevron { transform: rotate(90deg); }

.file-path {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.file-name {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}
.file-sub {
  color: hsl(var(--muted-foreground));
  font: 12px/1.4 var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.badge svg { width: 12px; height: 12px; }
.badge-secondary {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.badge-destructive {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive-border));
}
.badge-warning {
  background: hsl(var(--warning-soft));
  color: hsl(var(--warning));
  border-color: hsl(var(--warning-border));
}

.file-issues {
  display: none;
  border-top: 1px solid hsl(var(--border));
}
.file-card.is-open .file-issues { display: block; }

.issue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 10px 16px;
  border-top: 1px solid hsl(var(--border));
}
.issue:first-child { border-top: 0; }

.issue-left {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  flex: 0 0 auto;
  margin-top: 1px;
}
.issue-left svg { width: 12px; height: 12px; }
.issue.is-error .issue-left {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
}
.issue.is-warning .issue-left {
  background: hsl(var(--warning-soft));
  color: hsl(var(--warning));
}

.issue-body {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.issue-message {
  font-size: 13.5px;
  color: hsl(var(--foreground));
  line-height: 1.45;
}
.issue-meta {
  color: hsl(var(--muted-foreground));
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 12px;
  align-items: center;
}
.issue-rule {
  font: 12px/1.4 var(--font-mono);
  color: hsl(var(--muted-foreground));
}
.issue-meta .sep {
  width: 3px; height: 3px; border-radius: 999px;
  background: hsl(var(--muted-foreground) / 0.5);
}
.issue-loc {
  color: hsl(var(--muted-foreground));
  font: 12px/1.4 var(--font-mono);
  align-self: start;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.parse-list { display: grid; gap: 8px; }
.parse-item {
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--destructive-border));
  background: hsl(var(--destructive-soft));
}
.parse-path {
  font: 12px/1.4 var(--font-mono);
  color: hsl(var(--destructive));
  font-weight: 500;
}
.parse-message {
  margin-top: 4px;
  color: hsl(var(--foreground));
  font-size: 13px;
}

.empty {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 48px 24px;
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius-lg);
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
}
.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  margin-bottom: 12px;
}
.empty-icon svg { width: 18px; height: 18px; }
.empty-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: hsl(var(--foreground));
}
.empty-sub {
  margin-top: 4px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  padding: 24px 2px 0;
  border-top: 1px solid hsl(var(--border));
  margin-top: 32px;
}

.hidden { display: none !important; }

.sev-critical { color: hsl(0 72% 51%); }
.sev-high { color: hsl(20 90% 48%); }
.sev-error { color: hsl(0 72% 51%); }
.sev-moderate { color: hsl(38 92% 50%); }
.sev-warning { color: hsl(45 93% 47%); }
.sev-low { color: hsl(142 71% 45%); }
.sev-info { color: hsl(217 91% 60%); }
.sev-hint { color: hsl(262 83% 58%); }

@media (prefers-color-scheme: dark) {
  .sev-critical { color: hsl(0 84% 65%); }
  .sev-high { color: hsl(24 94% 60%); }
  .sev-error { color: hsl(0 84% 65%); }
  .sev-moderate { color: hsl(38 92% 60%); }
  .sev-warning { color: hsl(48 96% 65%); }
  .sev-low { color: hsl(142 71% 55%); }
  .sev-info { color: hsl(213 94% 68%); }
  .sev-hint { color: hsl(262 83% 70%); }
}

@media (max-width: 1024px) {
  .summary-strip { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .hero-title { font-size: 24px; }
  .issue { grid-template-columns: auto minmax(0, 1fr); }
  .issue-loc { grid-column: 2; margin-top: 0; }
  .topbar { flex-direction: column; align-items: flex-start; }
  .topbar-meta { justify-content: flex-start; }
}
`;
}

function buildIssueRow(failure: RuleFailure): string {
    const severityClass = isErrorSeverity(failure.severity) ? 'is-error' : 'is-warning';
    const icon = isErrorSeverity(failure.severity) ? iconAlert() : iconWarning();
    const location = typeof failure.line === 'number'
        ? `L${failure.line}${typeof failure.column === 'number' ? `:${failure.column}` : ''}`
        : '—';

    return `
<div class="issue ${severityClass}" data-severity="${escapeHtml(failure.severity)}" data-search="${escapeHtml([
            failure.ruleName,
            failure.message,
            failure.filePath,
            failure.severity,
        ].join(' ').toLowerCase())}">
  <div class="issue-left">${icon}</div>
  <div class="issue-body">
    <div class="issue-message">${escapeHtml(failure.message)}</div>
    <div class="issue-meta">
      <span class="issue-rule">${escapeHtml(failure.ruleName)}</span>
      <span class="sep"></span>
      <span>${escapeHtml(humanSeverity(failure.severity))}</span>
    </div>
  </div>
  <div class="issue-loc">${escapeHtml(location)}</div>
</div>`;
}

function buildFileCard(bucket: FileBucket, index: number): string {
    const fileName = bucket.relativePath.split('/').pop() ?? bucket.relativePath;
    const issues = bucket.failures.map((failure) => buildIssueRow(failure)).join('\n');
    const openClass = index < 3 ? ' is-open' : '';

    return `
<section class="file-card${openClass}" data-file-card data-search="${escapeHtml(bucket.relativePath.toLowerCase())}">
  <button type="button" class="file-header" data-toggle>
    <div class="file-main">
      <span class="chevron">${iconChevron()}</span>
      <span class="file-icon">${iconFile()}</span>
      <span class="file-path">
        <span class="file-name">${escapeHtml(fileName)}</span>
        <span class="file-sub">${escapeHtml(bucket.relativePath)}</span>
      </span>
    </div>
    <span class="file-meta">
      ${bucket.errorCount > 0 ? `<span class="badge badge-error">${iconAlert()} ${bucket.errorCount} error${bucket.errorCount === 1 ? '' : 's'}</span>` : ''}
      ${bucket.warningCount > 0 ? `<span class="badge badge-warning">${iconWarning()} ${bucket.warningCount} warning${bucket.warningCount === 1 ? '' : 's'}</span>` : ''}
      <span class="badge badge-neutral">${bucket.failures.length} issue${bucket.failures.length === 1 ? '' : 's'}</span>
    </span>
  </button>
  <div class="file-issues">
    ${issues}
  </div>
</section>`;
}

function buildScript(): string {
    return `
(() => {
  const root = document.documentElement;
  const searchInput = document.getElementById('searchInput');
  const expandAll = document.getElementById('expandAll');
  const collapseAll = document.getElementById('collapseAll');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const fileCards = Array.from(document.querySelectorAll('[data-file-card]'));
  const noResults = document.getElementById('noResults');

  let severityFilter = 'all';

  function setOpen(card, open) {
    card.classList.toggle('is-open', open);
  }

  for (const card of fileCards) {
    const toggle = card.querySelector('[data-toggle]');
    if (!toggle) continue;
    toggle.addEventListener('click', () => {
      setOpen(card, !card.classList.contains('is-open'));
    });
  }

  if (expandAll) {
    expandAll.addEventListener('click', () => {
      for (const card of fileCards) setOpen(card, true);
    });
  }

  if (collapseAll) {
    collapseAll.addEventListener('click', () => {
      for (const card of fileCards) setOpen(card, false);
    });
  }

  function applyFilters() {
    const query = (searchInput && 'value' in searchInput ? searchInput.value : '').trim().toLowerCase();
    let visibleCount = 0;

    for (const card of fileCards) {
      const issues = Array.from(card.querySelectorAll('.issue'));
      let issueVisibleCount = 0;

      for (const issue of issues) {
        const matchesQuery = !query || (issue.dataset.search || '').includes(query) || (card.dataset.search || '').includes(query);
        const matchesSeverity = severityFilter === 'all'
          || (severityFilter === 'errors' && issue.classList.contains('is-error'))
          || (severityFilter === 'warnings' && issue.classList.contains('is-warning'));

        const visible = matchesQuery && matchesSeverity;
        issue.classList.toggle('hidden', !visible);
        if (visible) issueVisibleCount += 1;
      }

      card.classList.toggle('hidden', issueVisibleCount === 0);
      if (issueVisibleCount > 0) visibleCount += 1;
    }

    if (noResults) {
      noResults.classList.toggle('hidden', visibleCount !== 0);
    }
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      const next = button.getAttribute('data-filter') || 'all';
      severityFilter = severityFilter === next ? 'all' : next;
      for (const candidate of filterButtons) {
        candidate.classList.toggle('is-active', candidate.getAttribute('data-filter') === severityFilter);
      }
      applyFilters();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  applyFilters();
})();`;
}

function buildHtml(
    results: ReadonlyArray<RuleResult>,
    parseErrors: ReadonlyArray<ParseError>,
    summary: ResultSummary,
    generatedAt: Date,
): string {
    const allFailures = collectFailures(results);
    const fileBuckets = bucketFiles(results);
    const severityCounts = summarizeSeverities(allFailures);
    const topRules = summarizeRules(allFailures);
    const topRuleMax = topRules[0]?.[1] ?? 1;
    const projectName = path.basename(process.cwd());
    const timestamp = formatTimestamp(generatedAt);

    const totalViolations = allFailures.length;
    const totalFiles = summary.totalFiles;
    const affectedFiles = fileBuckets.length;
    const hasIssues = totalViolations > 0 || parseErrors.length > 0;
    const passed = totalViolations === 0 && parseErrors.length === 0;
    const cachedCopy = typeof summary.cachedTasks === 'number' && summary.cachedTasks > 0
        ? `${summary.cachedTasks.toLocaleString()} cached`
        : 'No cache';

    const subtitle = passed
        ? `No violations found across ${totalFiles.toLocaleString()} scanned file${totalFiles === 1 ? '' : 's'}.`
        : `${totalViolations.toLocaleString()} violation${totalViolations === 1 ? '' : 's'} across ${affectedFiles.toLocaleString()} affected file${affectedFiles === 1 ? '' : 's'}. ${parseErrors.length > 0 ? `${parseErrors.length.toLocaleString()} parse error${parseErrors.length === 1 ? '' : 's'}. ` : ''}${cachedCopy}.`;

    const severityRows = SEVERITY_ORDER
        .filter((severity) => (severityCounts[severity] ?? 0) > 0)
        .map((severity) => `
<div class="severity-row ${severityColorClass(severity)}">
  <span class="left"><span class="dot" style="background:currentColor"></span><span class="severity-name">${escapeHtml(humanSeverity(severity))}</span></span>
  <span class="severity-count">${(severityCounts[severity] ?? 0).toLocaleString()}</span>
</div>`)
        .join('\n') || '<div class="severity-row sev-low"><span class="left"><span class="dot" style="background:currentColor"></span><span class="severity-name">No issues</span></span><span class="severity-count">0</span></div>';

    const rulesHtml = topRules.length > 0
        ? topRules.map(([ruleName, count]) => `
<div class="rule-item">
  <div class="rule-top">
    <span class="rule-name">${escapeHtml(ruleName)}</span>
    <span class="rule-count">${count.toLocaleString()}</span>
  </div>
  <div class="rule-bar"><span style="width:${Math.max(8, Math.round((count / topRuleMax) * 100))}%"></span></div>
</div>`).join('\n')
        : '<div class="rule-item"><div class="rule-top"><span class="rule-name">No rule violations</span><span class="rule-count">0</span></div><div class="rule-bar"><span style="width:0%"></span></div></div>';

    const parseErrorsBlock = parseErrors.length > 0 ? `
<section class="card parse-errors">
  <div class="card-head">
    <div class="card-title">Parse errors</div>
    <div class="files-count">${parseErrors.length.toLocaleString()}</div>
  </div>
  <div class="parse-list">
    ${parseErrors.map((error) => `
      <div class="parse-item">
        <div class="parse-path">${escapeHtml(relativeToRoot(error.filePath))}</div>
        <div class="parse-message">${escapeHtml(error.message)}</div>
      </div>`).join('\n')}
  </div>
</section>` : '';

    const filesHtml = fileBuckets.length > 0
        ? fileBuckets.map((bucket, index) => buildFileCard(bucket, index)).join('\n')
        : `
<div class="empty">
  <div>
    <div>${iconFile()}</div>
    <div class="empty-title">No violations found</div>
    <div class="empty-sub">This scan completed cleanly.</div>
  </div>
</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ngcompass — ${escapeHtml(projectName)}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        ${angularLogo()}
        <span class="brand-name">ngcompass</span>
      </div>
      <div class="topbar-meta">
        <span class="pill">${escapeHtml(timestamp)}</span>
        <span class="pill">${escapeHtml(projectName)}</span>
      </div>
    </header>

    <section class="shell">
      <div class="hero">
        <div class="hero-copy">
          <div class="eyebrow">Angular static analysis · ${totalFiles.toLocaleString()} files scanned</div>
          <h1 class="hero-title ${passed ? 'pass' : 'fail'}">${passed ? 'Analysis Passed' : 'Issues Found'}</h1>
          <div class="hero-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-label">Errors</div>
            <div class="stat-value">${summary.totalErrors.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Warnings</div>
            <div class="stat-value">${summary.totalWarnings.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Affected files</div>
            <div class="stat-value">${affectedFiles.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Violations</div>
            <div class="stat-value">${totalViolations.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <main class="content">
        ${hasIssues ? `
        <section class="summary-strip">
          <div class="card">
            <div class="card-head">
              <div class="card-title">Severity breakdown</div>
              <div class="files-count">${totalViolations.toLocaleString()} total</div>
            </div>
            <div class="severity-list">${severityRows}</div>
          </div>
          <div class="card">
            <div class="card-head">
              <div class="card-title">Top rules</div>
              <div class="files-count">${topRules.length.toLocaleString()}</div>
            </div>
            <div class="rule-list">${rulesHtml}</div>
          </div>
        </section>
        ` : ''}

        ${parseErrorsBlock}

        <section class="card controls">
          <div class="controls-row">
            <label class="searchbox" aria-label="Search issues">
              ${iconSearch()}
              <input id="searchInput" type="search" placeholder="Search files, rules, messages..." autocomplete="off" spellcheck="false">
            </label>
            <div class="actions">
              <button type="button" class="btn" data-filter="errors">Errors</button>
              <button type="button" class="btn" data-filter="warnings">Warnings</button>
              <button type="button" class="btn" id="expandAll">Expand all</button>
              <button type="button" class="btn" id="collapseAll">Collapse all</button>
            </div>
          </div>
        </section>

        <div class="files-head">
          <div class="files-title">Violations by file</div>
          <div class="files-count">${affectedFiles.toLocaleString()} file${affectedFiles === 1 ? '' : 's'}</div>
        </div>

        <section class="file-list">
          ${filesHtml}
          <div id="noResults" class="empty hidden">
            <div>
              <div class="empty-title">No matching results</div>
              <div class="empty-sub">Try clearing search or changing the severity filter.</div>
            </div>
          </div>
        </section>
      </main>
    </section>

    <footer class="footer">
      <span>Generated by ngcompass</span>
      <span>Compact report UI inspired by shadcn-style primitives</span>
    </footer>
  </div>

  <script>${buildScript()}</script>
</body>
</html>`;
}

export class HtmlReporter implements Reporter {
    private readonly accumulatedResults: RuleResult[] = [];
    private readonly accumulatedParseErrors: ParseError[] = [];

    constructor(
        private readonly outputPath: string = DEFAULT_OUTPUT_PATH,
        private readonly out: ReporterOutput = processOutput,
        private readonly autoOpen: boolean = false,
    ) {}

    report(results: ReadonlyArray<RuleResult>): void {
        for (const result of results) this.accumulatedResults.push(result);
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        for (const error of errors) this.accumulatedParseErrors.push(error);
    }

    error(error: Error): void {
        this.out.error(`[ngcompass] Error: ${error.message}`);
    }

    summary(stats: ResultSummary): void {
        const html = buildHtml(
            this.accumulatedResults,
            this.accumulatedParseErrors,
            stats,
            new Date(),
        );

        const absPath = path.resolve(process.cwd(), this.outputPath);

        try {
            fs.writeFileSync(absPath, html, 'utf8');
            this.out.error(`\n\u2713 Report saved: ${path.relative(process.cwd(), absPath) || absPath}\n`);
            if (this.autoOpen) openInBrowser(absPath);
        } catch (writeErr: unknown) {
            this.out.error(
                `[ngcompass] Failed to write report to ${absPath}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
            );
        }
    }

    step(_message: string): void {}
    info(_message: string): void {}
    debug(_message: string): void {}
}
