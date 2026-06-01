import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { resolveBrowserLaunch } from '@ngcompass/reporters';

const DEFAULT_OUTPUT_PATH = 'ngcompass-circular-report.html';

const BROWSER_SPAWN_OPTIONS = {
  detached: true,
  stdio: 'ignore',
} as const;

const WINDOWS_BROWSER_SPAWN_OPTIONS = {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
} as const;

export interface CircularReportPayload {
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;
  readonly rootDir: string;
  readonly fileCount: number;
  readonly generatedAt: Date;
}

export async function writeCircularUiReport(
  payload: CircularReportPayload,
  outputPath?: string
): Promise<string> {
  const finalPath = path.resolve(
    process.cwd(),
    outputPath ?? DEFAULT_OUTPUT_PATH
  );
  const html = renderCircularHtml(payload);
  await fs.writeFile(finalPath, html, 'utf8');
  return finalPath;
}

export function openCircularReport(filePath: string): void {
  const launch = resolveBrowserLaunch(filePath);
  const options = launch.windowsHide
    ? WINDOWS_BROWSER_SPAWN_OPTIONS
    : BROWSER_SPAWN_OPTIONS;
  spawn(launch.command, [...launch.args], options).unref();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toRelative(filePath: string, rootDir: string): string {
  const rel = path.relative(rootDir, filePath);
  return (rel || filePath).replace(/\\/g, '/');
}

interface ProcessedCycle {
  readonly id: number;
  readonly nodes: ReadonlyArray<string>;
  readonly relativeNodes: ReadonlyArray<string>;
  readonly length: number;
}

function processCycles(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  rootDir: string
): ProcessedCycle[] {
  const processed: ProcessedCycle[] = [];
  for (let i = 0; i < cycles.length; i++) {
    const nodes = cycles[i];
    const relativeNodes = nodes.map((n) => toRelative(n, rootDir));
    processed.push({
      id: i,
      nodes,
      relativeNodes,
      length: nodes.length - 1,
    });
  }
  processed.sort((a, b) => b.length - a.length);
  return processed;
}

function uniqueFilesInCycles(
  cycles: ReadonlyArray<ProcessedCycle>
): number {
  const seen = new Set<string>();
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.nodes.length - 1; i++) {
      seen.add(cycle.nodes[i]);
    }
  }
  return seen.size;
}

function longestCycle(cycles: ReadonlyArray<ProcessedCycle>): number {
  let max = 0;
  for (const c of cycles) {
    if (c.length > max) max = c.length;
  }
  return max;
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

const LS_RE = new RegExp('\\u2028', 'g');
const PS_RE = new RegExp('\\u2029', 'g');

function escapeForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LS_RE, '\\u2028')
    .replace(PS_RE, '\\u2029');
}

function renderCircularHtml(payload: CircularReportPayload): string {
  const processed = processCycles(payload.cycles, payload.rootDir);
  const totalCycles = processed.length;
  const filesInvolved = uniqueFilesInCycles(processed);
  const longest = longestCycle(processed);
  const hasCycles = totalCycles > 0;

  const data = {
    cycles: processed.map((c) => ({
      id: c.id,
      length: c.length,
      nodes: c.relativeNodes,
    })),
    fileCount: payload.fileCount,
    rootDir: payload.rootDir,
    generatedAt: payload.generatedAt.toISOString(),
  };

  const statusLabel = hasCycles ? 'Cycles detected' : 'No cycles';
  const statusClass = hasCycles ? 'fail' : 'pass';
  const heroTitle = hasCycles
    ? `${totalCycles} circular ${totalCycles === 1 ? 'dependency' : 'dependencies'} found`
    : 'No circular dependencies';
  const heroSubtitle = hasCycles
    ? `Analyzed ${payload.fileCount.toLocaleString()} files. Resolve the cycles below to keep your dependency graph acyclic.`
    : `Analyzed ${payload.fileCount.toLocaleString()} files. Your dependency graph is clean.`;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ngcompass — Circular Dependencies</title>
<style>${renderStyles()}</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <div class="brand-name">ngcompass</div>
        <div class="brand-sub">Circular Dependency Report</div>
      </div>
    </div>
    <div class="topbar-right">
      <span class="meta-time">${escapeHtml(formatTimestamp(payload.generatedAt))}</span>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
        <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <div class="hero-copy">
        <span class="status-indicator ${statusClass}">${escapeHtml(statusLabel)}</span>
        <h1 class="hero-title ${statusClass}">${escapeHtml(heroTitle)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubtitle)}</p>
      </div>
      <div class="stats-row">
        <div class="card stat-card">
          <div class="stat-top">
            <div class="stat-label">Cycles</div>
            <div class="stat-icon ${hasCycles ? 'destructive' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>
            </div>
          </div>
          <div class="stat-value ${hasCycles ? 'destructive' : ''}">${totalCycles}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-top">
            <div class="stat-label">Files in cycles</div>
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
          </div>
          <div class="stat-value">${filesInvolved}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-top">
            <div class="stat-label">Longest cycle</div>
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
          </div>
          <div class="stat-value">${longest}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-top">
            <div class="stat-label">Scanned files</div>
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          </div>
          <div class="stat-value">${payload.fileCount.toLocaleString()}</div>
        </div>
      </div>
    </section>

    ${hasCycles ? renderWorkbench() : renderEmptyState()}
  </main>
</div>

<script id="circular-data" type="application/json">${escapeForScript(JSON.stringify(data))}</script>
<script>${renderScript()}</script>
</body>
</html>`;
}

function renderEmptyState(): string {
  return `
    <section class="card empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2>Your dependency graph is acyclic</h2>
      <p>No circular imports were detected. Re-run with <code>--force</code> after future changes to keep this clean.</p>
    </section>`;
}

function renderWorkbench(): string {
  return `
    <section class="workbench">
      <aside class="card sidebar">
        <div class="sidebar-head">
          <div class="card-title">Detected Cycles</div>
          <span class="card-sub" id="cycleCount">—</span>
        </div>
        <div class="searchbox">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" id="searchInput" placeholder="Filter by file path..." />
        </div>
        <div class="sort-row">
          <label>Sort
            <select id="sortSelect" class="selectbox">
              <option value="length-desc">Length (longest first)</option>
              <option value="length-asc">Length (shortest first)</option>
              <option value="path">Path A-Z</option>
            </select>
          </label>
        </div>
        <div class="cycle-list" id="cycleList"></div>
      </aside>

      <section class="card detail">
        <div class="detail-head">
          <div>
            <div class="card-title" id="detailTitle">Select a cycle</div>
            <div class="card-sub" id="detailSub">Choose a cycle from the list to inspect its files.</div>
          </div>
          <div class="view-toggle" role="tablist">
            <button class="view-btn active" data-view="graph" role="tab">Graph</button>
            <button class="view-btn" data-view="chain" role="tab">Chain</button>
          </div>
        </div>
        <div class="detail-body">
          <div class="view-panel active" id="graphPanel">
            <div class="graph-wrap">
              <div class="zoom-controls">
                <button class="zoom-btn" id="zoomIn" aria-label="Zoom in" title="Zoom in">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>
                </button>
                <button class="zoom-btn" id="zoomOut" aria-label="Zoom out" title="Zoom out">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="zoom-btn" id="zoomReset" aria-label="Reset view" title="Reset view">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>
                </button>
                <span class="zoom-level" id="zoomLevel">100%</span>
              </div>
              <svg id="graphSvg" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid meet"></svg>
              <div class="zoom-hint">Scroll to zoom · Drag to pan</div>
            </div>
          </div>
          <div class="view-panel" id="chainPanel">
            <ol class="chain-list" id="chainList"></ol>
          </div>
        </div>
      </section>
    </section>`;
}

function renderStyles(): string {
  return `
:root {
  --bg: 220 14% 8%;
  --card: 220 14% 11%;
  --card-2: 220 14% 13%;
  --border: 220 13% 20%;
  --muted: 220 14% 17%;
  --muted-fg: 220 9% 60%;
  --fg: 220 13% 95%;
  --brand: 192 91% 55%;
  --brand-soft: 192 91% 55% / 0.12;
  --ring: 192 91% 55%;
  --success: 142 71% 50%;
  --success-soft: 142 71% 50% / 0.12;
  --destructive: 0 84% 62%;
  --destructive-soft: 0 84% 62% / 0.12;
  --destructive-border: 0 84% 62% / 0.32;
  --warning: 38 92% 58%;
  --warning-soft: 38 92% 58% / 0.14;
  --radius: 8px;
  --radius-lg: 14px;
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
  --font-heading: var(--font-sans);
}
html:not([data-theme="dark"]) {
  --bg: 0 0% 100%;
  --card: 0 0% 100%;
  --card-2: 220 14% 97%;
  --border: 220 13% 88%;
  --muted: 220 14% 94%;
  --muted-fg: 220 9% 40%;
  --fg: 220 13% 12%;
  --brand: 199 91% 45%;
  --brand-soft: 199 91% 45% / 0.10;
  --ring: 199 91% 45%;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: hsl(var(--bg));
  color: hsl(var(--fg));
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  min-height: 100vh;
}
.app { min-height: 100vh; display: flex; flex-direction: column; }

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card) / 0.6);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, hsl(var(--brand)), hsl(var(--ring)));
  box-shadow: 0 0 24px hsl(var(--brand) / 0.4);
}
.brand-name { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
.brand-sub { color: hsl(var(--muted-fg)); font-size: 12px; }
.topbar-right { display: flex; align-items: center; gap: 14px; }
.meta-time { color: hsl(var(--muted-fg)); font-size: 12px; }
.theme-toggle {
  width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  background: hsl(var(--card-2));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--fg));
  border-radius: var(--radius);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.theme-toggle:hover { border-color: hsl(var(--brand)); background: hsl(var(--brand-soft)); }
.theme-toggle svg { width: 16px; height: 16px; }
html[data-theme="dark"] .theme-icon-moon { display: none; }
html:not([data-theme="dark"]) .theme-icon-sun { display: none; }

.container { max-width: 1320px; margin: 0 auto; padding: 32px 28px 60px; width: 100%; }

.hero { display: grid; gap: 28px; margin-bottom: 36px; }
.hero-copy { display: grid; gap: 12px; }
.hero-title {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.hero-title.pass { color: hsl(var(--success)); }
.hero-title.fail { color: hsl(var(--destructive)); }
.hero-subtitle {
  margin: 0;
  color: hsl(var(--muted-fg));
  font-size: 15px;
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

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}
.stat-card { padding: 20px 22px; display: grid; gap: 8px; }
.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  color: hsl(var(--muted-fg));
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stat-icon {
  width: 32px; height: 32px;
  border-radius: var(--radius);
  display: inline-flex; align-items: center; justify-content: center;
  background: hsl(var(--muted));
  color: hsl(var(--muted-fg));
}
.stat-icon.destructive {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
}
.stat-icon svg { width: 16px; height: 16px; }
.stat-value {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-value.destructive { color: hsl(var(--destructive)); }

.workbench {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  min-height: 620px;
}
@media (max-width: 980px) {
  .workbench { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.sidebar { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.sidebar-head {
  padding: 18px 20px 8px;
  display: flex; align-items: baseline; justify-content: space-between;
}
.card-title { font-weight: 600; font-size: 14px; }
.card-sub { color: hsl(var(--muted-fg)); font-size: 12px; }

.searchbox { position: relative; padding: 0 20px; }
.searchbox svg {
  position: absolute;
  left: 32px; top: 50%;
  width: 15px; height: 15px;
  transform: translateY(-50%);
  color: hsl(var(--muted-fg));
  pointer-events: none;
}
.searchbox input {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 36px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card-2));
  color: hsl(var(--fg));
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.searchbox input:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.18);
}

.sort-row { padding: 12px 20px 8px; display: flex; }
.sort-row label {
  display: flex; align-items: center; gap: 8px;
  color: hsl(var(--muted-fg));
  font-size: 12px;
  width: 100%;
}
.selectbox {
  flex: 1;
  height: 32px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card-2));
  color: hsl(var(--fg));
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
}

.cycle-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 560px;
}

.cycle-item {
  cursor: pointer;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  background: hsl(var(--card-2) / 0.5);
  transition: all .15s ease;
  display: grid;
  gap: 4px;
}
.cycle-item:hover {
  background: hsl(var(--brand-soft));
  border-color: hsl(var(--brand) / 0.4);
}
.cycle-item.active {
  background: hsl(var(--brand-soft));
  border-color: hsl(var(--brand));
}
.cycle-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cycle-item-id {
  font-weight: 600;
  font-size: 13px;
  font-family: var(--font-mono);
}
.cycle-item-len {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
}
.cycle-item-preview {
  font-family: var(--font-mono);
  font-size: 11px;
  color: hsl(var(--muted-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cycle-item.empty {
  text-align: center;
  color: hsl(var(--muted-fg));
  font-size: 13px;
  padding: 24px;
  cursor: default;
}
.cycle-item.empty:hover {
  background: transparent;
  border-color: transparent;
}

.detail { display: flex; flex-direction: column; min-height: 0; }
.detail-head {
  padding: 18px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid hsl(var(--border));
  gap: 16px;
  flex-wrap: wrap;
}
.view-toggle {
  display: inline-flex;
  background: hsl(var(--card-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 3px;
}
.view-btn {
  background: transparent;
  border: 0;
  color: hsl(var(--muted-fg));
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: background .15s ease, color .15s ease;
}
.view-btn.active {
  background: hsl(var(--brand));
  color: white;
}
.view-btn:not(.active):hover { color: hsl(var(--fg)); }

.detail-body { flex: 1; min-height: 0; position: relative; }
.view-panel { display: none; height: 100%; min-height: 480px; padding: 20px 22px; }
.view-panel.active { display: block; }

.graph-wrap {
  width: 100%;
  height: 100%;
  min-height: 480px;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius);
  background:
    radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0);
  background-size: 24px 24px;
}
#graphSvg {
  width: 100%;
  height: 100%;
  min-height: 480px;
  display: block;
  cursor: grab;
  touch-action: none;
}
#graphSvg.panning { cursor: grabbing; }
.zoom-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: hsl(var(--card) / 0.85);
  backdrop-filter: blur(6px);
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  z-index: 2;
}
.zoom-btn {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent;
  border: 0;
  color: hsl(var(--fg));
  border-radius: 6px;
  cursor: pointer;
  transition: background .15s ease;
}
.zoom-btn:hover { background: hsl(var(--brand-soft)); color: hsl(var(--brand)); }
.zoom-btn svg { width: 15px; height: 15px; }
.zoom-level {
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-fg));
  padding: 0 6px;
  min-width: 44px;
  text-align: center;
}
.zoom-hint {
  position: absolute;
  bottom: 10px;
  left: 12px;
  font-size: 11px;
  color: hsl(var(--muted-fg));
  background: hsl(var(--card) / 0.75);
  backdrop-filter: blur(4px);
  padding: 4px 8px;
  border-radius: 999px;
  pointer-events: none;
  user-select: none;
}
.graph-node { cursor: pointer; }
.graph-node-circle {
  fill: hsl(var(--card-2));
  stroke: hsl(var(--brand));
  stroke-width: 2;
  transition: fill .2s ease, stroke .2s ease;
}
.graph-node:hover .graph-node-circle,
.graph-node.highlight .graph-node-circle {
  fill: hsl(var(--brand-soft));
  stroke: hsl(var(--brand));
  stroke-width: 3;
}
.graph-node-label {
  font-family: var(--font-mono);
  fill: hsl(var(--fg));
  pointer-events: none;
  user-select: none;
}
.graph-edge {
  stroke: hsl(var(--destructive));
  stroke-width: 1.8;
  fill: none;
  marker-end: url(#arrowhead);
  opacity: 0.75;
}

.chain-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
  counter-reset: step;
}
.chain-list li {
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 12px 16px 12px 48px;
  background: hsl(var(--card-2));
  border-radius: var(--radius);
  position: relative;
  margin-bottom: 8px;
  word-break: break-all;
}
.chain-list li::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px; height: 26px;
  background: hsl(var(--brand));
  color: white;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center;
}
.chain-list li.cycle-close {
  background: hsl(var(--destructive-soft));
  color: hsl(var(--destructive));
  border: 1px dashed hsl(var(--destructive-border));
}
.chain-list li.cycle-close::before {
  background: hsl(var(--destructive));
}

.empty-state {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 60px 32px;
  gap: 12px;
}
.empty-icon {
  width: 56px; height: 56px;
  border-radius: 999px;
  background: hsl(var(--success-soft));
  color: hsl(var(--success));
  display: grid; place-items: center;
}
.empty-icon svg { width: 28px; height: 28px; }
.empty-state h2 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
.empty-state p { margin: 0; color: hsl(var(--muted-fg)); }
.empty-state code {
  font-family: var(--font-mono);
  background: hsl(var(--muted));
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
`;
}

function renderScript(): string {
  return `
(function() {
  const dataEl = document.getElementById('circular-data');
  if (!dataEl || !dataEl.textContent) return;
  const data = JSON.parse(dataEl.textContent);
  const cycles = data.cycles || [];

  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
  });

  const listEl = document.getElementById('cycleList');
  const countEl = document.getElementById('cycleCount');
  const searchEl = document.getElementById('searchInput');
  const sortEl = document.getElementById('sortSelect');
  const detailTitle = document.getElementById('detailTitle');
  const detailSub = document.getElementById('detailSub');
  const chainList = document.getElementById('chainList');
  const graphSvg = document.getElementById('graphSvg');

  if (!listEl) return;

  const state = {
    selectedId: cycles.length > 0 ? cycles[0].id : null,
    search: '',
    sort: 'length-desc',
    view: 'graph',
  };

  function filteredCycles() {
    const q = state.search.trim().toLowerCase();
    let filtered = cycles;
    if (q) {
      filtered = cycles.filter((c) => c.nodes.some((n) => n.toLowerCase().includes(q)));
    }
    const sorted = filtered.slice();
    if (state.sort === 'length-desc') {
      sorted.sort((a, b) => b.length - a.length);
    } else if (state.sort === 'length-asc') {
      sorted.sort((a, b) => a.length - b.length);
    } else if (state.sort === 'path') {
      sorted.sort((a, b) => a.nodes[0].localeCompare(b.nodes[0]));
    }
    return sorted;
  }

  function previewOf(cycle) {
    const head = cycle.nodes[0];
    const last = cycle.nodes[cycle.nodes.length - 2];
    if (cycle.length === 2) return head + ' ↔ ' + last;
    return head + ' → ... → ' + last;
  }

  function renderList() {
    const visible = filteredCycles();
    countEl.textContent = visible.length + ' / ' + cycles.length;
    if (visible.length === 0) {
      listEl.innerHTML = '<div class="cycle-item empty">No cycles match your filter.</div>';
      return;
    }
    const html = visible.map((c) => {
      const active = c.id === state.selectedId ? ' active' : '';
      return '<div class="cycle-item' + active + '" data-id="' + c.id + '">' +
        '<div class="cycle-item-head">' +
          '<span class="cycle-item-id">Cycle #' + (c.id + 1) + '</span>' +
          '<span class="cycle-item-len">' + c.length + ' nodes</span>' +
        '</div>' +
        '<div class="cycle-item-preview">' + escapeHtml(previewOf(c)) + '</div>' +
      '</div>';
    }).join('');
    listEl.innerHTML = html;
    listEl.querySelectorAll('.cycle-item[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-id'));
        select(id);
      });
    });
  }

  function select(id) {
    state.selectedId = id;
    renderList();
    renderDetail();
  }

  function renderDetail() {
    if (state.selectedId === null) {
      detailTitle.textContent = 'No cycle selected';
      detailSub.textContent = '';
      chainList.innerHTML = '';
      graphSvg.innerHTML = '';
      return;
    }
    const cycle = cycles.find((c) => c.id === state.selectedId);
    if (!cycle) return;
    detailTitle.textContent = 'Cycle #' + (cycle.id + 1);
    detailSub.textContent = cycle.length + ' files form this cycle.';
    renderChain(cycle);
    renderGraph(cycle);
  }

  function renderChain(cycle) {
    const items = cycle.nodes.map((node, idx) => {
      const isClose = idx === cycle.nodes.length - 1;
      const cls = isClose ? ' class="cycle-close"' : '';
      return '<li' + cls + '>' + escapeHtml(node) + (isClose ? ' <span style="opacity:.7">(cycle closes)</span>' : '') + '</li>';
    }).join('');
    chainList.innerHTML = items;
  }

  function renderGraph(cycle) {
    const uniqueNodes = cycle.nodes.slice(0, -1);
    const n = uniqueNodes.length;

    const nodeRadius = Math.max(18, Math.min(36, 86 / Math.sqrt(n + 1)));
    const labelFontSize = Math.max(9, Math.min(11, nodeRadius * 0.34));
    const gap = Math.max(100, nodeRadius * 0.75);
    const minLayoutRadius = (nodeRadius + gap / 2) / Math.sin(Math.PI / Math.max(2, n));
    const layoutRadius = Math.max(160, minLayoutRadius);
    const padding = nodeRadius + 40;
    const size = Math.round((layoutRadius + padding) * 2);
    viewSize.w = size;
    viewSize.h = size;
    graphSvg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    const cx = size / 2, cy = size / 2;

    const positions = uniqueNodes.map((label, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * layoutRadius,
        y: cy + Math.sin(angle) * layoutRadius,
        label,
      };
    });

    const defs = '<defs>' +
      '<marker id="arrowhead" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--destructive))" />' +
      '</marker>' +
    '</defs>';

    const edges = positions.map((p, i) => {
      const next = positions[(i + 1) % n];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const x1 = p.x + ux * nodeRadius;
      const y1 = p.y + uy * nodeRadius;
      const x2 = next.x - ux * nodeRadius;
      const y2 = next.y - uy * nodeRadius;
      const bulge = Math.min(dist * 0.08, 24);
      const midX = (x1 + x2) / 2 - uy * bulge;
      const midY = (y1 + y2) / 2 + ux * bulge;
      return '<path class="graph-edge" d="M' + x1 + ',' + y1 + ' Q' + midX + ',' + midY + ' ' + x2 + ',' + y2 + '" />';
    }).join('');

    const nodes = positions.map((p) => {
      const label = shortLabel(p.label, nodeRadius);
      return '<g class="graph-node" transform="translate(' + p.x + ',' + p.y + ')">' +
        '<circle class="graph-node-circle" r="' + nodeRadius + '" />' +
        '<text class="graph-node-label" text-anchor="middle" dy="' + (labelFontSize * 0.35).toFixed(1) + '" style="font-size:' + labelFontSize.toFixed(1) + 'px">' + escapeHtml(label) + '</text>' +
        '<title>' + escapeHtml(p.label) + '</title>' +
      '</g>';
    }).join('');

    graphSvg.innerHTML = defs + '<g id="viewport" transform="translate(0,0) scale(1)">' + edges + nodes + '</g>';
    resetZoom();
  }

  const zoomLevelEl = document.getElementById('zoomLevel');
  const zoom = { scale: 1, tx: 0, ty: 0 };
  const viewSize = { w: 800, h: 560 };
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 6;

  function applyZoom() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    vp.setAttribute('transform', 'translate(' + zoom.tx + ',' + zoom.ty + ') scale(' + zoom.scale + ')');
    if (zoomLevelEl) {
      zoomLevelEl.textContent = Math.round(zoom.scale * 100) + '%';
    }
  }

  function resetZoom() {
    zoom.scale = 1;
    zoom.tx = 0;
    zoom.ty = 0;
    applyZoom();
  }

  function svgPointFromEvent(evt) {
    const rect = graphSvg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: viewSize.w / 2, y: viewSize.h / 2 };
    }
    const x = ((evt.clientX - rect.left) / rect.width) * viewSize.w;
    const y = ((evt.clientY - rect.top) / rect.height) * viewSize.h;
    return { x, y };
  }

  function zoomAt(svgX, svgY, factor) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom.scale * factor));
    if (next === zoom.scale) return;
    const ratio = next / zoom.scale;
    zoom.tx = svgX - (svgX - zoom.tx) * ratio;
    zoom.ty = svgY - (svgY - zoom.ty) * ratio;
    zoom.scale = next;
    applyZoom();
  }

  graphSvg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = svgPointFromEvent(e);
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoomAt(p.x, p.y, factor);
  }, { passive: false });

  let panState = null;
  graphSvg.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    panState = {
      startX: e.clientX,
      startY: e.clientY,
      origTx: zoom.tx,
      origTy: zoom.ty,
    };
    graphSvg.classList.add('panning');
  });
  window.addEventListener('mousemove', (e) => {
    if (!panState) return;
    const rect = graphSvg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = ((e.clientX - panState.startX) / rect.width) * viewSize.w;
    const dy = ((e.clientY - panState.startY) / rect.height) * viewSize.h;
    zoom.tx = panState.origTx + dx;
    zoom.ty = panState.origTy + dy;
    applyZoom();
  });
  window.addEventListener('mouseup', () => {
    if (!panState) return;
    panState = null;
    graphSvg.classList.remove('panning');
  });

  document.getElementById('zoomIn').addEventListener('click', () => zoomAt(viewSize.w / 2, viewSize.h / 2, 1.25));
  document.getElementById('zoomOut').addEventListener('click', () => zoomAt(viewSize.w / 2, viewSize.h / 2, 1 / 1.25));
  document.getElementById('zoomReset').addEventListener('click', () => resetZoom());

  function shortLabel(filePath, nodeRadius) {
    const parts = filePath.split('/');
    const last = parts[parts.length - 1];
    const maxChars = Math.max(6, Math.floor((nodeRadius || 30) * 0.42));
    if (last.length <= maxChars) return last;
    return last.slice(0, Math.max(3, maxChars - 1)) + '…';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  searchEl && searchEl.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderList();
  });
  sortEl && sortEl.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderList();
  });

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (!view) return;
      state.view = view;
      document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view-panel').forEach((p) => {
        p.classList.toggle('active', p.id === view + 'Panel');
      });
    });
  });

  if (cycles.length > 0) {
    renderList();
    renderDetail();
  }
})();
`;
}
