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

/* ── Top bar ────────────────────────────────────────────── */

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

/* ── Hero ───────────────────────────────────────────────── */

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

/* ── Stat cards ─────────────────────────────────────────── */

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

/* ── Content layout ─────────────────────────────────────── */

.content { display: grid; gap: 32px; }

.summary-strip {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
}

/* ── Card primitives ────────────────────────────────────── */

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

/* ── Severity dot (shared) ──────────────────────────────── */

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: currentColor;
}

/* ── Top rules ──────────────────────────────────────────── */

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

/* ── Controls bar ───────────────────────────────────────── */

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

/* ── Files section header ───────────────────────────────── */

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

/* ── File cards ─────────────────────────────────────────── */

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

/* ── Badges ─────────────────────────────────────────────── */

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

/* ── Issue rows ─────────────────────────────────────────── */

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

/* ── Parse errors ───────────────────────────────────────── */

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

/* ── Donut chart ────────────────────────────────────────── */

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

/* ── Empty state ────────────────────────────────────────── */

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

/* ── Footer ─────────────────────────────────────────────── */

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

/* ── Severity colours ───────────────────────────────────── */

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

/* ── Responsive ─────────────────────────────────────────── */

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
  <title>ngcompass — ${escapeHtml(projectName)}</title>
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
          <div class="eyebrow">Angular static analysis · ${totalFiles.toLocaleString()} files scanned</div>
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
