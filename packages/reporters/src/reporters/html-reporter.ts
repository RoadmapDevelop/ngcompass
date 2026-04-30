import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import type { RuleResult, RuleFailure } from '@ngcompass/common';
import type { Reporter, ResultSummary, ParseError } from '../types.js';
import { isErrorSeverity, severityRank, compareByPosition } from '../severity-utils.js';
import { processOutput, type ReporterOutput } from '../output.js';

const DEFAULT_OUTPUT_PATH = 'ngcompass-report.html';
const SEVERITY_ORDER = ['critical', 'high', 'error', 'moderate', 'warn', 'low', 'info', 'hint'] as const;

type SeverityCount = Partial<Record<string, number>>;

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
        case 'warn':
        case 'warning': return 'sev-warning';
        case 'low': return 'sev-low';
        case 'info': return 'sev-info';
        case 'hint': return 'sev-hint';
        default: return 'sev-info';
    }
}

function humanSeverity(severity: string): string {
    if (severity === 'warn') return 'Warning';
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

function buildSeverityChart(severityCounts: SeverityCount, total: number): string {
    const R = 54;
    const CX = 76;
    const CY = 76;
    const SW = 20;
    const circumference = 2 * Math.PI * R;

    const activeSeverities = SEVERITY_ORDER.filter(s => (severityCounts[s] ?? 0) > 0);

    if (total === 0 || activeSeverities.length === 0) {
        return `
<div class="chart-wrap">
  <svg viewBox="0 0 152 152" class="donut-svg" aria-label="No issues">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="hsl(var(--muted))" stroke-width="${SW}"/>
    <text x="${CX}" y="${CY - 6}" class="donut-center-val" text-anchor="middle">0</text>
    <text x="${CX}" y="${CY + 12}" class="donut-center-label" text-anchor="middle">issues</text>
  </svg>
  <div class="chart-legend">
    <div class="chart-legend-item">
      <span class="dot sev-low"></span>
      <span class="chart-legend-label">No issues</span>
      <span class="chart-legend-count">0</span>
    </div>
  </div>
</div>`;
    }

    let accumulated = 0;
    const segments = activeSeverities.map(severity => {
        const count = severityCounts[severity] ?? 0;
        const segLen = (count / total) * circumference;
        const dashOffset = circumference - accumulated;
        const el = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
      class="${severityColorClass(severity)}" stroke="currentColor" stroke-width="${SW}"
      stroke-dasharray="${segLen.toFixed(3)} ${(circumference - segLen).toFixed(3)}"
      stroke-dashoffset="${dashOffset.toFixed(3)}"
      transform="rotate(-90 ${CX} ${CY})"/>`;
        accumulated += segLen;
        return el;
    });

    const legend = activeSeverities.map(severity => {
        const count = severityCounts[severity] ?? 0;
        const pct = Math.round((count / total) * 100);
        return `<div class="chart-legend-item">
  <span class="dot ${severityColorClass(severity)}" style="background:currentColor"></span>
  <span class="chart-legend-label">${escapeHtml(humanSeverity(severity))}</span>
  <span class="chart-legend-count">${count.toLocaleString()} <span class="chart-legend-pct">${pct}%</span></span>
</div>`;
    }).join('');

    return `
<div class="chart-wrap">
  <svg viewBox="0 0 152 152" class="donut-svg" role="img" aria-label="Severity distribution donut chart">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="hsl(var(--muted))" stroke-width="${SW}"/>
    ${segments.join('\n    ')}
    <text x="${CX}" y="${CY - 7}" class="donut-center-val" text-anchor="middle">${total.toLocaleString()}</text>
    <text x="${CX}" y="${CY + 12}" class="donut-center-label" text-anchor="middle">issues</text>
  </svg>
  <div class="chart-legend">
    ${legend}
  </div>
</div>`;
}

function brandLogo(): string {
    const src = 'data:image/png;base64,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';
    return `<img class="brand-logo" src="${src}" alt="" aria-hidden="true">`;
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
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20ZM15 9l-6 6m0-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconWarning(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function iconList(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
  font: 14px/1.6 var(--font-sans);
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
button, input { font: inherit; color: inherit; }
a { color: inherit; }

.page {
  width: min(1120px, calc(100vw - 48px));
  margin: 0 auto;
  padding: 36px 0 72px;
}

/* β”€β”€ Top bar β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 36px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-size: 15px;
}
.brand-logo {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: block;
  border-radius: 8px;
  object-fit: cover;
}

.topbar-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.topbar-meta .sep {
  width: 3px; height: 3px; border-radius: 999px;
  background: hsl(var(--muted-foreground) / 0.4);
}

/* β”€β”€ Hero β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.hero {
  display: grid;
  gap: 28px;
  margin-bottom: 48px;
}

.eyebrow {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.01em;
  margin-bottom: 4px;
}

.hero-copy { display: grid; gap: 12px; }

.hero-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: hsl(var(--foreground));
}
.hero-title.pass { color: hsl(var(--success)); }
.hero-title.fail { color: hsl(var(--destructive)); }

.hero-subtitle {
  color: hsl(var(--muted-foreground));
  font-size: 15px;
  line-height: 1.6;
  max-width: 72ch;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
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

/* β”€β”€ Stat cards β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
}

.stat-card {
  padding: 22px 24px;
  display: grid;
  gap: 10px;
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stat-label {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  flex: 0 0 auto;
}
.stat-icon svg {
  width: 17px;
  height: 17px;
}
.stat-icon.destructive {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive-soft));
}
.stat-icon.warning {
  color: hsl(var(--warning));
  background: hsl(var(--warning-soft));
}

.stat-value {
  font-size: 32px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: hsl(var(--foreground));
}
.stat-value.destructive { color: hsl(var(--destructive)); }
.stat-value.warning { color: hsl(var(--warning)); }

/* β”€β”€ Content layout β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.content { display: grid; gap: 32px; }

.summary-strip {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
}

/* β”€β”€ Card primitives β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 0;
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
  padding: 16px 24px 24px;
}

/* β”€β”€ Severity dot (shared) β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: currentColor;
}

/* β”€β”€ Top rules β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.rule-list { display: grid; gap: 18px; }

.rule-item { display: grid; gap: 8px; }
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
  white-space: nowrap;
}
.rule-bar {
  height: 5px;
  border-radius: 999px;
  background: hsl(var(--muted));
  overflow: hidden;
}
.rule-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: hsl(var(--foreground) / 0.55);
}

/* β”€β”€ Controls bar β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.controls { padding: 20px 24px; }

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.searchbox {
  position: relative;
  flex: 1 1 320px;
  min-width: 0;
}
.searchbox svg {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 15px;
  height: 15px;
  transform: translateY(-50%);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}
.searchbox input {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 38px;
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
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  height: 40px;
  border-radius: var(--radius);
  padding: 0 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}
.btn:hover { background: hsl(var(--accent)); }
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

/* β”€β”€ Files section header β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.files-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 2px 4px;
}
.files-title {
  color: hsl(var(--foreground));
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.files-count {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

/* β”€β”€ File cards β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.file-list { display: grid; gap: 12px; }

.file-card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.file-card:hover { box-shadow: 0 1px 6px hsl(var(--foreground) / 0.06); }

.file-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.file-header:hover { background: hsl(var(--muted) / 0.4); }

.file-main {
  display: flex;
  align-items: center;
  gap: 12px;
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
  gap: 10px;
  flex-wrap: wrap;
}
.file-name {
  font-size: 14px;
  font-weight: 600;
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
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* β”€β”€ Badges β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.badge svg { width: 12px; height: 12px; }
.badge-secondary, .badge-neutral {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.badge-destructive, .badge-error {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive-border));
}
.badge-warning {
  background: hsl(var(--warning-soft));
  color: hsl(var(--warning));
  border-color: hsl(var(--warning-border));
}

/* β”€β”€ Issue rows β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.file-issues {
  display: none;
  border-top: 1px solid hsl(var(--border));
}
.file-card.is-open .file-issues { display: block; }

.issue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px 20px;
  border-top: 1px solid hsl(var(--border));
  transition: background 0.12s ease;
}
.issue:first-child { border-top: 0; }
.issue:hover { background: hsl(var(--muted) / 0.3); }

.issue-left {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  flex: 0 0 auto;
  margin-top: 2px;
}
.issue-left svg { width: 13px; height: 13px; }
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
  gap: 8px;
}
.issue-message {
  font-size: 14px;
  color: hsl(var(--foreground));
  line-height: 1.5;
}
.issue-meta {
  color: hsl(var(--muted-foreground));
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
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
  white-space: nowrap;
}

/* β”€β”€ Parse errors β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.parse-errors .card-body { padding-top: 20px; }

.parse-list { display: grid; gap: 10px; }
.parse-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 16px 20px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--destructive-border));
  background: hsl(var(--destructive-soft));
}
.parse-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: hsl(var(--destructive));
  background: hsl(var(--background) / 0.68);
  flex: 0 0 auto;
  margin-top: 1px;
}
.parse-icon svg {
  width: 13px;
  height: 13px;
}
.parse-copy { min-width: 0; }
.parse-path {
  font: 12px/1.4 var(--font-mono);
  color: hsl(var(--destructive));
  font-weight: 500;
}
.parse-message {
  margin-top: 8px;
  color: hsl(var(--foreground));
  font-size: 13px;
  line-height: 1.5;
}

/* β”€β”€ Donut chart β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.chart-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
}
.donut-svg {
  width: 140px;
  height: 140px;
  flex: 0 0 140px;
  overflow: visible;
}
.donut-center-val {
  font-size: 20px;
  font-weight: 700;
  font-family: var(--font-sans);
  fill: hsl(var(--foreground));
  letter-spacing: -0.03em;
}
.donut-center-label {
  font-size: 10px;
  font-weight: 500;
  font-family: var(--font-sans);
  fill: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.chart-legend {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 9px;
}
.chart-legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chart-legend-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
}
.chart-legend-count {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.chart-legend-pct {
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

/* β”€β”€ Empty state β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.empty {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 64px 32px;
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius-lg);
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
}
.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  margin-bottom: 16px;
}
.empty-icon svg { width: 22px; height: 22px; }
.empty-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: hsl(var(--foreground));
}
.empty-sub {
  margin-top: 6px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  line-height: 1.5;
}

/* β”€β”€ Footer β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

.footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  padding: 32px 2px 0;
  border-top: 1px solid hsl(var(--border));
  margin-top: 56px;
}

.hidden { display: none !important; }

/* β”€β”€ Severity colours β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

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

/* β”€β”€ Responsive β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€β”€ */

@media (max-width: 1024px) {
  .summary-strip { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .page { width: calc(100vw - 32px); padding: 24px 0 48px; }
  .hero-title { font-size: 26px; }
  .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .stat-card { padding: 16px 18px; }
  .issue { grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 14px 16px; }
  .issue-loc { grid-column: 2; margin-top: 0; }
  .file-header { padding: 14px 16px; }
  .controls { padding: 16px; }
  .controls-row { flex-direction: column; align-items: stretch; }
  .topbar { flex-direction: column; align-items: flex-start; }
  .topbar-meta { justify-content: flex-start; }
  .card-head { padding: 16px 18px 0; }
  .card-body { padding: 14px 18px 20px; }
}
`;
}

function buildIssueRow(failure: RuleFailure): string {
    const severityClass = isErrorSeverity(failure.severity) ? 'is-error' : 'is-warning';
    const icon = isErrorSeverity(failure.severity) ? iconAlert() : iconWarning();
    const location = typeof failure.line === 'number'
        ? `L${failure.line}${typeof failure.column === 'number' ? `:${failure.column}` : ''}`
        : 'β€”';

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
      <span class="badge badge-neutral">${iconList()} ${bucket.failures.length} issue${bucket.failures.length === 1 ? '' : 's'}</span>
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
  <div class="card-body">
    <div class="parse-list">
      ${parseErrors.map((error) => `
        <div class="parse-item">
          <div class="parse-icon">${iconAlert()}</div>
          <div class="parse-copy">
            <div class="parse-path">${escapeHtml(relativeToRoot(error.filePath))}</div>
            <div class="parse-message">${escapeHtml(error.message)}</div>
          </div>
        </div>`).join('\n')}
    </div>
  </div>
</section>` : '';

    const filesHtml = fileBuckets.length > 0
        ? fileBuckets.map((bucket, index) => buildFileCard(bucket, index)).join('\n')
        : `
<div class="empty">
  <div>
    <div class="empty-icon">${iconFile()}</div>
    <div class="empty-title">No violations found</div>
    <div class="empty-sub">This scan completed cleanly.</div>
  </div>
</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ngcompass β€” ${escapeHtml(projectName)}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        ${brandLogo()}
        <span class="brand-name">ngcompass</span>
      </div>
      <div class="topbar-meta">
        <span>${escapeHtml(timestamp)}</span>
        <span class="sep"></span>
        <span>${escapeHtml(projectName)}</span>
      </div>
    </header>

    <section class="shell">
      <div class="hero">
        <div class="hero-copy">
          <div class="eyebrow">Angular static analysis Β· ${totalFiles.toLocaleString()} files scanned</div>
          <h1 class="hero-title ${passed ? 'pass' : 'fail'}">${passed ? 'Analysis Passed' : 'Issues Found'}</h1>
          <div class="hero-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="stats-row">
          <div class="card stat-card">
            <div class="stat-top">
              <div class="stat-label">Errors</div>
              <div class="stat-icon${summary.totalErrors > 0 ? ' destructive' : ''}">${iconAlert()}</div>
            </div>
            <div class="stat-value${summary.totalErrors > 0 ? ' destructive' : ''}">${summary.totalErrors.toLocaleString()}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-top">
              <div class="stat-label">Warnings</div>
              <div class="stat-icon${summary.totalWarnings > 0 ? ' warning' : ''}">${iconWarning()}</div>
            </div>
            <div class="stat-value${summary.totalWarnings > 0 ? ' warning' : ''}">${summary.totalWarnings.toLocaleString()}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-top">
              <div class="stat-label">Affected files</div>
              <div class="stat-icon">${iconFile()}</div>
            </div>
            <div class="stat-value">${affectedFiles.toLocaleString()}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-top">
              <div class="stat-label">Violations</div>
              <div class="stat-icon${totalViolations > 0 ? ' destructive' : ''}">${iconList()}</div>
            </div>
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
            <div class="card-body">${buildSeverityChart(severityCounts, totalViolations)}</div>
          </div>
          <div class="card">
            <div class="card-head">
              <div class="card-title">Top rules</div>
              <div class="files-count">${topRules.length.toLocaleString()}</div>
            </div>
            <div class="card-body"><div class="rule-list">${rulesHtml}</div></div>
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

