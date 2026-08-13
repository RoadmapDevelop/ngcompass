import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type { RuleResult, RuleFailure } from '@ngcompass/common';
import type { Reporter, ResultSummary, ParseError } from '../models/index.js';
import { isErrorSeverity, severityRank, compareByPosition } from '../formatting/severity-utils.js';
import { processOutput } from '../formatting/output.js';
import type { ReporterOutput } from '../models/index.js';
import { getAnalysisStatus } from '../formatting/analysis-status.js';

const DEFAULT_OUTPUT_PATH = 'ngcompass-report.html';
const SEVERITY_ORDER = ['critical', 'high', 'error', 'moderate', 'warn', 'low', 'info', 'hint'] as const;

type SeverityCount = Partial<Record<string, number>>;
type CategoryCount = Record<string, number>;

type FileBucket = {
    filePath: string;
    relativePath: string;
    failures: RuleFailure[];
    errorCount: number;
    warningCount: number;
    dominantSeverity: string;
};

interface BrowserLaunch {
    readonly command: string;
    readonly args: ReadonlyArray<string>;
    readonly windowsHide: boolean;
}

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

const WINDOWS_BROWSER_RELATIVE_PATHS: ReadonlyArray<string> = [
    'Google\\Chrome\\Application\\chrome.exe',
    'Microsoft\\Edge\\Application\\msedge.exe',
    'Mozilla Firefox\\firefox.exe',
    'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];

function findWindowsBrowser(): string | null {
    const roots = [
        process.env.LOCALAPPDATA,
        process.env.PROGRAMFILES,
        process.env['PROGRAMFILES(X86)'],
    ];
    for (const relative of WINDOWS_BROWSER_RELATIVE_PATHS) {
        for (const root of roots) {
            if (!root) continue;
            const candidate = path.join(root, relative);
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return null;
}

export function resolveBrowserLaunch(filePath: string): BrowserLaunch {
    const abs = path.resolve(filePath);
    const fileUrl = pathToFileURL(abs).href;
    if (process.platform === 'win32') {
        const browser = findWindowsBrowser();
        if (browser) {
            return { command: browser, args: [fileUrl], windowsHide: true };
        }
        return { command: 'cmd', args: ['/c', 'start', '', fileUrl], windowsHide: true };
    }
    if (process.platform === 'darwin') {
        return { command: 'open', args: [fileUrl], windowsHide: false };
    }
    return { command: 'xdg-open', args: [fileUrl], windowsHide: false };
}

const BROWSER_SPAWN_OPTIONS = { detached: true, stdio: 'ignore' } as const;
const WINDOWS_BROWSER_SPAWN_OPTIONS = { detached: true, stdio: 'ignore', windowsHide: true } as const;

function openInBrowser(filePath: string): void {
    const launch = resolveBrowserLaunch(filePath);
    const options = launch.windowsHide ? WINDOWS_BROWSER_SPAWN_OPTIONS : BROWSER_SPAWN_OPTIONS;
    spawn(launch.command, launch.args, options).unref();
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

function categoryForRule(ruleName: string): string {
    if (ruleName === 'no-bypass-sanitization' || ruleName === 'template-no-unsafe-bindings') {
        return 'Security';
    }
    if (ruleName === 'template-prefer-control-flow' || ruleName === 'template-no-async-pipe-duplication') {
        return 'Template';
    }
    if (ruleName.startsWith('template-no-') || ruleName.startsWith('template-track') || ruleName === 'prefer-on-push-component-change-detection') {
        return 'Performance';
    }
    if (ruleName.startsWith('rxjs-') || ruleName.startsWith('toSignal-') || ruleName.startsWith('signal-avoid') || ruleName.startsWith('signal-prefer-computed')) {
        return 'Reactivity';
    }
    if (ruleName.startsWith('signal-prefer-') || ruleName === 'prefer-inject-over-constructor-di') {
        return 'Modern API';
    }
    if (ruleName === 'no-document-access' || ruleName === 'prefer-after-render-over-after-view-init') {
        return 'SSR';
    }
    if (ruleName.startsWith('spec-')) {
        return 'Testing';
    }
    return 'Correctness';
}

function categoryColorClass(category: string): string {
    switch (category) {
        case 'Performance': return 'cat-performance';
        case 'Reactivity': return 'cat-reactivity';
        case 'Modern API': return 'cat-modern-api';
        case 'Security': return 'cat-security';
        case 'SSR': return 'cat-ssr';
        case 'Template': return 'cat-template';
        case 'Testing': return 'cat-testing';
        default: return 'cat-correctness';
    }
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

function summarizeCategories(failures: ReadonlyArray<RuleFailure>): Array<[string, number]> {
    const counts: CategoryCount = {};
    for (const failure of failures) {
        const category = categoryForRule(failure.ruleName);
        counts[category] = (counts[category] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function uniqueRules(failures: ReadonlyArray<RuleFailure>): string[] {
    return [...new Set(failures.map((failure) => failure.ruleName))].sort();
}

function buildSelectOptions(values: ReadonlyArray<string>): string {
    return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
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

function buildCategoryChart(categoryCounts: ReadonlyArray<[string, number]>, total: number): string {
    if (total === 0 || categoryCounts.length === 0) {
        return '<div class="category-empty">No category violations</div>';
    }

    const max = categoryCounts[0]?.[1] ?? 1;
    return `
<div class="category-chart">
  ${categoryCounts.map(([category, count]) => {
        const pct = Math.round((count / total) * 100);
        const width = Math.max(8, Math.round((count / max) * 100));
        return `
  <div class="category-row">
    <div class="category-top">
      <span class="category-name">${escapeHtml(category)}</span>
      <span class="category-count">${count.toLocaleString()} <span>${pct}%</span></span>
    </div>
    <div class="category-bar ${categoryColorClass(category)}"><span style="width:${width}%"></span></div>
  </div>`;
    }).join('\n')}
</div>`;
}

function buildSourceContext(failure: RuleFailure): string {
    if (typeof failure.line !== 'number' || failure.line < 1) return '';
    if (!fs.existsSync(failure.filePath)) return '';

    let raw: string;
    try {
        raw = fs.readFileSync(failure.filePath, 'utf8');
    } catch {
        return '';
    }

    const lines = raw.split(/\r?\n/);
    const targetIndex = failure.line - 1;
    const start = Math.max(0, targetIndex - 2);
    const end = Math.min(lines.length, targetIndex + 3);
    const width = String(end).length;

    const rows = lines.slice(start, end).map((line, offset) => {
        const lineNo = start + offset + 1;
        const active = lineNo === failure.line;
        return `<span class="code-line${active ? ' is-hit' : ''}"><span class="code-gutter">${String(lineNo).padStart(width, ' ')}</span><span class="code-text">${escapeHtml(line || ' ')}</span></span>`;
    }).join('\n');

    return `
<div class="source-context">
  <div class="source-title">Source context</div>
  <pre><code>${rows}</code></pre>
</div>`;
}

function buildRecommendation(failure: RuleFailure): string {
    if (!failure.fix) return '';

    return `
<div class="issue-recommendation">
  ${iconLightbulb()}
  <div class="recommendation-body"><span class="recommendation-label">Fix</span>${escapeHtml(failure.fix)}</div>
</div>`;
}

function brandLogoSrc(): string {
    return 'data:image/png;base64,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';
}

function brandLogo(): string {
    return `<img class="brand-logo" src="${brandLogoSrc()}" alt="" aria-hidden="true">`;
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

function iconSun(): string {
    return '<svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M2 12h2.5M19.5 12H22M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}

function iconMoon(): string {
    return '<svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="currentColor"/></svg>';
}

function iconLightbulb(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 4h4M15.1 14c.18-.98.65-1.74 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.6 4.6 0 0 1 8.9 14Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
  --primary: 224 71% 12%;
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
  --brand: 333 81% 53%;
  --brand-soft: 333 85% 96%;
  --cyan: 188 86% 43%;
  --violet: 262 83% 58%;
  --blue: 217 91% 60%;

  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  --font-sans: "IBM Plex Sans", "Inter Tight", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-heading: "Space Grotesk", var(--font-sans);
  --font-mono: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --background: 224 31% 7%;
  --foreground: 210 40% 98%;
  --card: 224 28% 10%;
  --card-foreground: 210 40% 98%;
  --muted: 224 24% 15%;
  --muted-foreground: 217 15% 70%;
  --border: 224 20% 20%;
  --input: 224 20% 20%;
  --ring: 188 86% 58%;
  --accent: 224 24% 15%;
  --accent-foreground: 210 40% 98%;
  --primary: 188 86% 58%;
  --primary-foreground: 224 31% 7%;
  --destructive: 0 84% 65%;
  --destructive-foreground: 0 0% 98%;
  --destructive-soft: 0 48% 14%;
  --destructive-border: 0 48% 28%;
  --warning: 42 96% 62%;
  --warning-soft: 38 54% 13%;
  --warning-border: 38 52% 26%;
  --success: 142 71% 55%;
  --success-soft: 142 42% 12%;
  --brand: 333 88% 68%;
  --brand-soft: 333 48% 15%;
  --cyan: 188 86% 58%;
  --violet: 262 83% 72%;
  --blue: 217 91% 70%;
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
  gap: 14px;
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: -0.01em;
  font-size: 18px;
}
.brand-logo {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: block;
  border-radius: 10px;
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

.theme-toggle {
  appearance: none;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
}
.theme-toggle:hover {
  border-color: hsl(var(--brand));
  background: hsl(var(--brand-soft));
}
.theme-toggle svg {
  width: 18px;
  height: 18px;
}
html[data-theme="dark"] .theme-icon-moon { display: none; }
html:not([data-theme="dark"]) .theme-icon-sun { display: none; }


.hero {
  display: grid;
  gap: 28px;
  margin-bottom: 48px;
}

.eyebrow {
  font-family: var(--font-heading);
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.01em;
  margin-bottom: 4px;
}

.hero-copy { display: grid; gap: 12px; }

.hero-title {
  margin: 0;
  font-family: var(--font-heading);
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
.status-indicator.warn {
  background: hsl(var(--warning-soft));
  color: hsl(var(--warning));
  border-color: hsl(var(--warning) / 0.32);
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
  font-family: var(--font-heading);
  font-size: 32px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: hsl(var(--foreground));
}
.stat-value.destructive { color: hsl(var(--destructive)); }
.stat-value.warning { color: hsl(var(--warning)); }


.content { display: grid; gap: 32px; }

.summary-strip {
  display: grid;
  grid-template-columns: 1.05fr 1fr 1fr;
  gap: 20px;
}


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


.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: currentColor;
}


.rule-list { display: grid; gap: 18px; }

.rule-item {
  display: grid;
  gap: 8px;
  color: hsl(var(--brand));
}
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
  color: currentColor;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rule-bar {
  height: 5px;
  border-radius: 999px;
  background: hsl(var(--muted) / 0.72);
  overflow: hidden;
}
.rule-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, currentColor, hsl(var(--cyan)));
  box-shadow: 0 0 18px currentColor;
}

.category-chart {
  display: grid;
  gap: 14px;
}
.category-row { display: grid; gap: 8px; }
.category-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.category-name {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.category-count {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.category-count span {
  color: hsl(var(--muted-foreground));
  font-weight: 400;
}
.category-bar {
  height: 7px;
  border-radius: 999px;
  background: hsl(var(--muted));
  overflow: hidden;
}
.category-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
}
.category-empty {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}


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

.selectbox {
  height: 40px;
  min-width: 164px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--input));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  outline: none;
}
.selectbox:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
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
  font-family: var(--font-heading);
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
.issue-recommendation {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  background: hsl(var(--muted) / 0.55);
  border-top: 1px solid hsl(var(--border));
}
.issue-recommendation svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  margin-top: 2px;
  color: hsl(var(--brand));
}
.recommendation-body {
  font-size: 12.5px;
  line-height: 1.5;
  color: hsl(var(--foreground));
}
.recommendation-label {
  display: inline-block;
  margin-right: 6px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--brand));
  vertical-align: baseline;
  position: relative;
  top: -0.5px;
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

.source-block {
  margin-top: 4px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
}
.source-context {
  background: hsl(var(--muted) / 0.45);
}
.source-block > .source-context {
  border: none;
  border-radius: 0;
  overflow: visible;
  margin-top: 0;
}
.source-title {
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.source-context pre {
  margin: 0;
  overflow-x: auto;
  font: 12px/1.6 var(--font-mono);
}
.code-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-width: max-content;
}
.code-line.is-hit {
  background: hsl(var(--destructive) / 0.08);
}
.code-gutter {
  padding: 0 12px;
  color: hsl(var(--muted-foreground));
  user-select: none;
  text-align: right;
  border-right: 1px solid hsl(var(--border));
}
.code-text {
  padding: 0 12px;
  color: hsl(var(--foreground));
  white-space: pre;
}


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


.chart-wrap {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 22px;
}
.donut-svg {
  width: 168px;
  height: 168px;
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
  width: min(100%, 260px);
  display: grid;
  gap: 12px;
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
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
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


.sev-critical { color: hsl(0 72% 51%); }
.sev-high { color: hsl(20 90% 48%); }
.sev-error { color: hsl(333 81% 53%); }
.sev-moderate { color: hsl(38 92% 50%); }
.sev-warning { color: hsl(45 93% 47%); }
.sev-low { color: hsl(142 71% 45%); }
.sev-info { color: hsl(217 91% 60%); }
.sev-hint { color: hsl(262 83% 58%); }

.cat-performance { color: hsl(333 81% 53%); }
.cat-reactivity { color: hsl(188 86% 43%); }
.cat-modern-api { color: hsl(262 83% 58%); }
.cat-security { color: hsl(0 72% 51%); }
.cat-ssr { color: hsl(217 91% 60%); }
.cat-template { color: hsl(38 92% 50%); }
.cat-testing { color: hsl(142 71% 45%); }
.cat-correctness { color: hsl(224 71% 38%); }

html[data-theme="dark"] .sev-critical { color: hsl(0 84% 65%); }
html[data-theme="dark"] .sev-high { color: hsl(24 94% 60%); }
html[data-theme="dark"] .sev-error { color: hsl(333 88% 68%); }
html[data-theme="dark"] .sev-moderate { color: hsl(38 92% 60%); }
html[data-theme="dark"] .sev-warning { color: hsl(48 96% 65%); }
html[data-theme="dark"] .sev-low { color: hsl(142 71% 55%); }
html[data-theme="dark"] .sev-info { color: hsl(213 94% 68%); }
html[data-theme="dark"] .sev-hint { color: hsl(262 83% 70%); }

html[data-theme="dark"] .cat-performance { color: hsl(333 88% 68%); }
html[data-theme="dark"] .cat-reactivity { color: hsl(188 86% 58%); }
html[data-theme="dark"] .cat-modern-api { color: hsl(262 83% 72%); }
html[data-theme="dark"] .cat-security { color: hsl(0 84% 65%); }
html[data-theme="dark"] .cat-ssr { color: hsl(213 94% 68%); }
html[data-theme="dark"] .cat-template { color: hsl(38 92% 60%); }
html[data-theme="dark"] .cat-testing { color: hsl(142 71% 55%); }
html[data-theme="dark"] .cat-correctness { color: hsl(188 86% 58%); }


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
  .actions { align-items: stretch; }
  .selectbox, .btn { width: 100%; justify-content: center; }
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
    const category = categoryForRule(failure.ruleName);
    const location = typeof failure.line === 'number'
        ? `L${failure.line}${typeof failure.column === 'number' ? `:${failure.column}` : ''}`
        : 'β€”';
    const sourceContext = buildSourceContext(failure);
    const recommendation = buildRecommendation(failure);
    const sourceBlock = (sourceContext || recommendation)
        ? `<div class="source-block">${sourceContext}${recommendation}</div>`
        : '';

    return `
<div class="issue ${severityClass}" data-severity="${escapeHtml(failure.severity)}" data-category="${escapeHtml(category)}" data-rule="${escapeHtml(failure.ruleName)}" data-search="${escapeHtml([
            failure.ruleName,
            failure.message,
            failure.fix ?? '',
            failure.filePath,
            failure.severity,
            category,
        ].join(' ').toLowerCase())}">
  <div class="issue-left">${icon}</div>
  <div class="issue-body">
    <div class="issue-message">${escapeHtml(failure.message)}</div>
    <div class="issue-meta">
      <span class="issue-rule">${escapeHtml(failure.ruleName)}</span>
      <span class="sep"></span>
      <span>${escapeHtml(category)}</span>
      <span class="sep"></span>
      <span>${escapeHtml(humanSeverity(failure.severity))}</span>
    </div>
    ${sourceBlock}
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
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categoryFilter');
  const ruleSelect = document.getElementById('ruleFilter');
  const expandAll = document.getElementById('expandAll');
  const collapseAll = document.getElementById('collapseAll');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const fileCards = Array.from(document.querySelectorAll('[data-file-card]'));
  const noResults = document.getElementById('noResults');

  let severityFilter = 'all';

  function applyTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = nextTheme;
    if (themeToggle) {
      const targetTheme = nextTheme === 'dark' ? 'light' : 'dark';
      themeToggle.setAttribute('aria-label', 'Switch to ' + targetTheme + ' theme');
      themeToggle.setAttribute('title', 'Switch to ' + targetTheme + ' theme');
    }
    try {
      localStorage.setItem('ngcompass-report-theme', nextTheme);
    } catch {}
  }

  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem('ngcompass-report-theme') || 'light';
  } catch {}
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

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
    const categoryFilter = categorySelect && 'value' in categorySelect ? categorySelect.value : 'all';
    const ruleFilter = ruleSelect && 'value' in ruleSelect ? ruleSelect.value : 'all';
    let visibleCount = 0;

    for (const card of fileCards) {
      const issues = Array.from(card.querySelectorAll('.issue'));
      let issueVisibleCount = 0;

      for (const issue of issues) {
        const matchesQuery = !query || (issue.dataset.search || '').includes(query) || (card.dataset.search || '').includes(query);
        const matchesSeverity = severityFilter === 'all'
          || (severityFilter === 'errors' && issue.classList.contains('is-error'))
          || (severityFilter === 'warnings' && issue.classList.contains('is-warning'));
        const matchesCategory = categoryFilter === 'all' || issue.dataset.category === categoryFilter;
        const matchesRule = ruleFilter === 'all' || issue.dataset.rule === ruleFilter;

        const visible = matchesQuery && matchesSeverity && matchesCategory && matchesRule;
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
  if (categorySelect) {
    categorySelect.addEventListener('change', applyFilters);
  }
  if (ruleSelect) {
    ruleSelect.addEventListener('change', applyFilters);
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
    const categoryCounts = summarizeCategories(allFailures);
    const topRules = summarizeRules(allFailures);
    const ruleOptions = uniqueRules(allFailures);
    const categoryOptions = categoryCounts.map(([category]) => category);
    const topRuleMax = topRules[0]?.[1] ?? 1;
    const projectName = path.basename(process.cwd());
    const timestamp = formatTimestamp(generatedAt);

    const totalViolations = allFailures.length;
    const totalFiles = summary.discoveredFiles ?? summary.scannedFiles ?? summary.totalFiles;
    const affectedFiles = fileBuckets.length;
    const skippedFileCount = summary.skippedFiles ?? summary.skippedFilePaths?.length ?? 0;
    const skippedSuffix = skippedFileCount > 0
        ? ` ${skippedFileCount.toLocaleString()} file${skippedFileCount === 1 ? '' : 's'} skipped.`
        : '';
    const hasIssues = totalViolations > 0 || parseErrors.length > 0;
    const status = parseErrors.length > 0
        ? { status: 'failed' as const, label: 'FAILED' as const }
        : getAnalysisStatus(summary);
    const passed = status.status === 'passed' && parseErrors.length === 0;
    const statusClass = status.status === 'failed'
        ? 'fail'
        : status.status === 'passed-with-warnings'
            ? 'warn'
            : 'pass';
    const cachedCopy = typeof summary.cachedTasks === 'number' && summary.cachedTasks > 0
        ? `${summary.cachedTasks.toLocaleString()} cached`
        : 'No cache';

    const subtitle = passed
        ? `No violations found across ${totalFiles.toLocaleString()} file${totalFiles === 1 ? '' : 's'}.${skippedSuffix}`
        : `${totalViolations.toLocaleString()} violation${totalViolations === 1 ? '' : 's'} in ${affectedFiles.toLocaleString()} of ${totalFiles.toLocaleString()} file${totalFiles === 1 ? '' : 's'}. ${parseErrors.length > 0 ? `${parseErrors.length.toLocaleString()} parse error${parseErrors.length === 1 ? '' : 's'}. ` : ''}${cachedCopy}.${skippedSuffix}`;

    const rulesHtml = topRules.length > 0
        ? topRules.map(([ruleName, count]) => `
<div class="rule-item ${categoryColorClass(categoryForRule(ruleName))}">
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

    const skippedFilePaths = summary.skippedFilePaths ?? [];
    const skippedBlock = skippedFilePaths.length > 0 ? `
<section class="card parse-errors">
  <div class="card-head">
    <div class="card-title">Skipped files</div>
    <div class="files-count">${skippedFilePaths.length.toLocaleString()}</div>
  </div>
  <div class="card-body">
    <div class="parse-list">
      ${skippedFilePaths.map((filePath) => `
        <div class="parse-item">
          <div class="parse-icon">${iconWarning()}</div>
          <div class="parse-copy">
            <div class="parse-path">${escapeHtml(relativeToRoot(filePath))}</div>
            <div class="parse-message">Type-check timed out or crashed &mdash; rules were not evaluated for this file.</div>
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
  <meta charset=”UTF-8”>
  <meta name=”viewport” content=”width=device-width, initial-scale=1.0”>
  <title>ngcompass &mdash; ${escapeHtml(projectName)}</title>
  <link rel=”icon” type=”image/png” href=”${brandLogoSrc()}”>
  <link rel=”preconnect” href=”https://fonts.googleapis.com”>
  <link rel=”preconnect” href=”https://fonts.gstatic.com” crossorigin>
  <link href=”https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap” rel=”stylesheet”>
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
        <button type="button" class="theme-toggle" id="themeToggle" aria-label="Switch to dark theme" title="Switch to dark theme">${iconMoon()}${iconSun()}</button>
      </div>
    </header>

    <section class="shell">
      <div class="hero">
        <div class="hero-copy">
          <div class="eyebrow">Angular static analysis Β· ${totalFiles.toLocaleString()} files scanned</div>
          <div class="status-indicator ${statusClass}">${escapeHtml(status.label)}</div>
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
              <div class="stat-label">Files with issues</div>
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
          <div class="card stat-card">
            <div class="stat-top">
              <div class="stat-label">Skipped</div>
              <div class="stat-icon${skippedFileCount > 0 ? ' warning' : ''}">${iconWarning()}</div>
            </div>
            <div class="stat-value${skippedFileCount > 0 ? ' warning' : ''}">${skippedFileCount.toLocaleString()}</div>
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
          <div class="card">
            <div class="card-head">
              <div class="card-title">Category breakdown</div>
              <div class="files-count">${categoryCounts.length.toLocaleString()}</div>
            </div>
            <div class="card-body">${buildCategoryChart(categoryCounts, totalViolations)}</div>
          </div>
        </section>
        ` : ''}

        ${parseErrorsBlock}

        ${skippedBlock}

        <section class="card controls">
          <div class="controls-row">
            <label class="searchbox" aria-label="Search issues">
              ${iconSearch()}
              <input id="searchInput" type="search" placeholder="Search files, rules, messages..." autocomplete="off" spellcheck="false">
            </label>
            <div class="actions">
              <select id="categoryFilter" class="selectbox" aria-label="Filter by category">
                <option value="all">All categories</option>
                ${buildSelectOptions(categoryOptions)}
              </select>
              <select id="ruleFilter" class="selectbox" aria-label="Filter by rule">
                <option value="all">All rules</option>
                ${buildSelectOptions(ruleOptions)}
              </select>
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
