/**
 * HTML Reporter for ngcompass.
 *
 * Generates a self-contained, single-file HTML report with:
 * - Angular-branded design (official red palette + dark theme)
 * - Summary dashboard (files, errors, warnings, duration)
 * - Violations grouped by file, sorted by severity then position
 * - Severity badges with colour coding
 * - Interactive search/filter
 * - Collapsible file sections
 * - Zero external dependencies (all CSS & JS inlined)
 *
 * Usage:
 *   ngcompass analyze --format html
 *   ngcompass analyze --format html --output report.html
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { RuleResult, RuleFailure } from '@ngcompass/common';
import type { Reporter, ResultSummary, ParseError } from '../types.js';
import { isErrorSeverity, severityRank, compareByPosition } from '../severity-utils.js';
import { processOutput, type ReporterOutput } from '../output.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_OUTPUT_PATH = 'ngcompass-report.html';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function severityColorClass(severity: string): string {
    switch (severity) {
        case 'critical': return 'sev-critical';
        case 'high':     return 'sev-high';
        case 'error':    return 'sev-error';
        case 'moderate': return 'sev-moderate';
        case 'warning':  return 'sev-warning';
        case 'low':      return 'sev-low';
        case 'info':     return 'sev-info';
        case 'hint':     return 'sev-hint';
        default:         return 'sev-info';
    }
}

function groupFailuresByFile(
    results: ReadonlyArray<RuleResult>,
): Map<string, RuleFailure[]> {
    const map = new Map<string, RuleFailure[]>();
    for (const result of results) {
        for (const failure of result.failures) {
            const existing = map.get(failure.filePath);
            if (existing) {
                existing.push(failure);
            } else {
                map.set(failure.filePath, [failure]);
            }
        }
    }
    return map;
}

function relativeToRoot(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// HTML template builders
// ---------------------------------------------------------------------------

function buildStyles(): string {
    return `
:root {
  --ng-red:         #DD0031;
  --ng-red-dark:    #C3002F;
  --ng-red-deeper:  #9a0020;
  --bg-page:        #0f1117;
  --bg-card:        #1a1d27;
  --bg-card-hover:  #1e2130;
  --bg-header:      #12151f;
  --bg-file:        #161924;
  --bg-badge:       #252836;
  --border:         #2a2d3e;
  --border-light:   #353849;
  --text-primary:   #e8eaf0;
  --text-secondary: #8b8fa8;
  --text-muted:     #555870;
  --text-link:      #7c9fef;
  --sev-critical-bg:  rgba(229, 57, 53, 0.15);
  --sev-critical-fg:  #ff6b6b;
  --sev-critical-bd:  rgba(229, 57, 53, 0.4);
  --sev-high-bg:      rgba(239, 108, 0, 0.15);
  --sev-high-fg:      #ffa040;
  --sev-high-bd:      rgba(239, 108, 0, 0.4);
  --sev-error-bg:     rgba(198, 40, 40, 0.15);
  --sev-error-fg:     #ef9a9a;
  --sev-error-bd:     rgba(198, 40, 40, 0.4);
  --sev-moderate-bg:  rgba(249, 168, 37, 0.12);
  --sev-moderate-fg:  #ffd54f;
  --sev-moderate-bd:  rgba(249, 168, 37, 0.35);
  --sev-warning-bg:   rgba(251, 192, 45, 0.12);
  --sev-warning-fg:   #ffe082;
  --sev-warning-bd:   rgba(251, 192, 45, 0.35);
  --sev-low-bg:       rgba(85, 139, 47, 0.15);
  --sev-low-fg:       #a5d6a7;
  --sev-low-bd:       rgba(85, 139, 47, 0.4);
  --sev-info-bg:      rgba(2, 119, 189, 0.15);
  --sev-info-fg:      #90caf9;
  --sev-info-bd:      rgba(2, 119, 189, 0.4);
  --sev-hint-bg:      rgba(106, 27, 154, 0.15);
  --sev-hint-fg:      #ce93d8;
  --sev-hint-bd:      rgba(106, 27, 154, 0.4);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter',
               'Helvetica Neue', Arial, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
  line-height: 1.6;
  font-size: 14px;
  min-height: 100vh;
}

/* ── Header ──────────────────────────────────────────────────── */
.header {
  background: linear-gradient(135deg, #0d1018 0%, #1a0510 50%, #0d1018 100%);
  border-bottom: 1px solid var(--ng-red-dark);
  padding: 0;
  position: relative;
  overflow: hidden;
}
.header::before {
  content: '';
  position: absolute;
  top: -60px; right: -60px;
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(221,0,49,0.12) 0%, transparent 70%);
  pointer-events: none;
}
.header::after {
  content: '';
  position: absolute;
  bottom: -80px; left: 10%;
  width: 400px; height: 200px;
  background: radial-gradient(ellipse, rgba(221,0,49,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: relative;
  z-index: 1;
}
.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}
.ng-logo {
  width: 48px; height: 48px;
  flex-shrink: 0;
  filter: drop-shadow(0 0 12px rgba(221,0,49,0.6));
}
.brand-text h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #fff;
  line-height: 1.2;
}
.brand-text h1 span { color: var(--ng-red); }
.brand-text p {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-top: 2px;
}
.header-meta {
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}
.header-meta strong { color: var(--text-secondary); }

/* ── Status banner ────────────────────────────────────────────── */
.status-banner {
  padding: 10px 32px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.status-banner.pass { color: #69f0ae; }
.status-banner.fail { color: var(--sev-critical-fg); }
.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-banner.pass .status-dot { background: #69f0ae; box-shadow: 0 0 8px #69f0ae; }
.status-banner.fail .status-dot { background: var(--ng-red); box-shadow: 0 0 8px var(--ng-red); }

/* ── Main layout ─────────────────────────────────────────────── */
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 32px 64px;
}

/* ── Summary cards ────────────────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 36px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px;
  position: relative;
  overflow: hidden;
  transition: border-color .2s, transform .15s;
}
.stat-card:hover {
  border-color: var(--border-light);
  transform: translateY(-1px);
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}
.stat-card.errors::before    { background: var(--ng-red); }
.stat-card.warnings::before  { background: #ffa040; }
.stat-card.files::before     { background: #7c9fef; }
.stat-card.duration::before  { background: #69f0ae; }
.stat-card.cached::before    { background: #ce93d8; }
.stat-card.rules::before     { background: #80deea; }
.stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.stat-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -1px;
}
.stat-card.errors .stat-value   { color: var(--sev-critical-fg); }
.stat-card.warnings .stat-value { color: #ffa040; }
.stat-card.files .stat-value    { color: var(--text-link); }
.stat-card.duration .stat-value { color: #69f0ae; }
.stat-card.cached .stat-value   { color: #ce93d8; }
.stat-card.rules .stat-value    { color: #80deea; }
.stat-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

/* ── Section titles ───────────────────────────────────────────── */
.section-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── Controls bar ─────────────────────────────────────────────── */
.controls {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  font-size: 14px;
}
.search-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px 9px 36px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color .2s;
}
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus { border-color: var(--ng-red); }
.filter-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
}
.filter-btn:hover, .filter-btn.active {
  border-color: var(--ng-red);
  color: #fff;
  background: rgba(221,0,49,0.1);
}
.filter-btn.active { color: var(--ng-red); }
.expand-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all .2s;
}
.expand-btn:hover { border-color: var(--border-light); color: var(--text-secondary); }

/* ── File sections ────────────────────────────────────────────── */
.file-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: border-color .2s;
}
.file-section:hover { border-color: var(--border-light); }
.file-section.hidden { display: none; }

.file-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-file);
  transition: background .15s;
}
.file-header:hover { background: var(--bg-card-hover); }
.file-chevron {
  color: var(--text-muted);
  font-size: 12px;
  transition: transform .2s;
  flex-shrink: 0;
}
.file-section.open .file-chevron { transform: rotate(90deg); }
.file-path {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12.5px;
  color: var(--text-link);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-path .path-dir  { color: var(--text-muted); }
.file-path .path-name { color: var(--text-link); font-weight: 600; }
.file-counts {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.count-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  line-height: 1.6;
}
.count-pill.err {
  background: rgba(221,0,49,0.15);
  color: var(--sev-critical-fg);
  border: 1px solid rgba(221,0,49,0.3);
}
.count-pill.warn {
  background: rgba(239,108,0,0.12);
  color: #ffa040;
  border: 1px solid rgba(239,108,0,0.3);
}

.file-body {
  display: none;
  border-top: 1px solid var(--border);
}
.file-section.open .file-body { display: block; }

/* ── Violation rows ───────────────────────────────────────────── */
.violation {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0 14px;
  align-items: start;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  transition: background .1s;
}
.violation:last-child { border-bottom: none; }
.violation:hover { background: rgba(255,255,255,0.02); }

.sev-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
  margin-top: 1px;
  border: 1px solid transparent;
}
.sev-critical { background: var(--sev-critical-bg); color: var(--sev-critical-fg); border-color: var(--sev-critical-bd); }
.sev-high     { background: var(--sev-high-bg);     color: var(--sev-high-fg);     border-color: var(--sev-high-bd); }
.sev-error    { background: var(--sev-error-bg);    color: var(--sev-error-fg);    border-color: var(--sev-error-bd); }
.sev-moderate { background: var(--sev-moderate-bg); color: var(--sev-moderate-fg); border-color: var(--sev-moderate-bd); }
.sev-warning  { background: var(--sev-warning-bg);  color: var(--sev-warning-fg);  border-color: var(--sev-warning-bd); }
.sev-low      { background: var(--sev-low-bg);      color: var(--sev-low-fg);      border-color: var(--sev-low-bd); }
.sev-info     { background: var(--sev-info-bg);     color: var(--sev-info-fg);     border-color: var(--sev-info-bd); }
.sev-hint     { background: var(--sev-hint-bg);     color: var(--sev-hint-fg);     border-color: var(--sev-hint-bd); }

.violation-body { min-width: 0; }
.violation-msg {
  font-size: 13.5px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
}
.violation-rule {
  font-size: 11.5px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  color: var(--text-muted);
  margin-top: 3px;
}
.violation-fix {
  font-size: 12px;
  color: #69f0ae;
  margin-top: 5px;
  padding: 5px 10px;
  background: rgba(105, 240, 174, 0.06);
  border-left: 2px solid rgba(105, 240, 174, 0.4);
  border-radius: 0 4px 4px 0;
}
.violation-fix::before { content: '↳ '; opacity: 0.7; }

.violation-loc {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  text-align: right;
  margin-top: 2px;
}

/* ── Parse errors ─────────────────────────────────────────────── */
.parse-error-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 8px;
}
.parse-error-icon { color: var(--sev-critical-fg); font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.parse-error-path {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-link);
  margin-bottom: 4px;
}
.parse-error-msg { font-size: 12px; color: var(--text-secondary); }

/* ── No issues state ─────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 64px 32px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-card);
}
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.empty-title { font-size: 20px; font-weight: 600; color: #69f0ae; margin-bottom: 8px; }
.empty-sub { font-size: 13px; color: var(--text-muted); }

/* ── No search results ────────────────────────────────────────── */
.no-results {
  display: none;
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 13px;
}
.no-results.visible { display: block; }

/* ── Footer ──────────────────────────────────────────────────── */
.footer {
  border-top: 1px solid var(--border);
  padding: 20px 32px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 8px;
}
.footer a { color: var(--ng-red); text-decoration: none; }
.footer a:hover { text-decoration: underline; }

/* ── Severity summary bar ─────────────────────────────────────── */
.severity-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.sev-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all .15s;
}
.sev-chip:hover, .sev-chip.active { filter: brightness(1.2); }
.sev-chip.inactive { opacity: 0.35; }
.sev-chip .chip-count {
  background: rgba(0,0,0,0.25);
  border-radius: 10px;
  padding: 0 6px;
  font-size: 10px;
  min-width: 18px;
  text-align: center;
}
.sev-chip.sev-critical { background: var(--sev-critical-bg); color: var(--sev-critical-fg); border-color: var(--sev-critical-bd); }
.sev-chip.sev-high     { background: var(--sev-high-bg);     color: var(--sev-high-fg);     border-color: var(--sev-high-bd); }
.sev-chip.sev-error    { background: var(--sev-error-bg);    color: var(--sev-error-fg);    border-color: var(--sev-error-bd); }
.sev-chip.sev-moderate { background: var(--sev-moderate-bg); color: var(--sev-moderate-fg); border-color: var(--sev-moderate-bd); }
.sev-chip.sev-warning  { background: var(--sev-warning-bg);  color: var(--sev-warning-fg);  border-color: var(--sev-warning-bd); }
.sev-chip.sev-low      { background: var(--sev-low-bg);      color: var(--sev-low-fg);      border-color: var(--sev-low-bd); }
.sev-chip.sev-info     { background: var(--sev-info-bg);     color: var(--sev-info-fg);     border-color: var(--sev-info-bd); }
.sev-chip.sev-hint     { background: var(--sev-hint-bg);     color: var(--sev-hint-fg);     border-color: var(--sev-hint-bd); }

/* ── Progress bar ─────────────────────────────────────────────── */
.rules-breakdown {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px;
  margin-bottom: 28px;
}
.rules-breakdown-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  margin-bottom: 14px;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.rule-row:last-child { margin-bottom: 0; }
.rule-name-col {
  font-family: monospace;
  color: var(--text-secondary);
  width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.rule-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.rule-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--ng-red);
  transition: width .3s;
}
.rule-count-col {
  width: 36px;
  text-align: right;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── Scrollbar ───────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-page); }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 700px) {
  .header-inner { flex-direction: column; align-items: flex-start; }
  .header-meta { text-align: left; }
  .main { padding: 20px 16px 40px; }
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .violation { grid-template-columns: auto 1fr; }
  .violation-loc { grid-column: 2; }
}
`;
}

function buildScript(): string {
    return `
(function() {
  // ── Expand / collapse file sections ─────────────────────────
  document.querySelectorAll('.file-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var section = header.closest('.file-section');
      section.classList.toggle('open');
    });
  });

  // ── Expand all / Collapse all ───────────────────────────────
  var expandAll = document.getElementById('expandAll');
  var collapseAll = document.getElementById('collapseAll');
  if (expandAll) {
    expandAll.addEventListener('click', function() {
      document.querySelectorAll('.file-section').forEach(function(s) { s.classList.add('open'); });
    });
  }
  if (collapseAll) {
    collapseAll.addEventListener('click', function() {
      document.querySelectorAll('.file-section').forEach(function(s) { s.classList.remove('open'); });
    });
  }

  // ── Search filter ────────────────────────────────────────────
  var searchInput = document.getElementById('searchInput');
  var noResults   = document.getElementById('noResults');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      applyFilters();
    });
  }

  // ── Severity chip filter ─────────────────────────────────────
  var activeFilters = new Set();
  document.querySelectorAll('.sev-chip[data-sev]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var sev = chip.dataset.sev;
      if (activeFilters.has(sev)) {
        activeFilters.delete(sev);
        chip.classList.remove('active');
        chip.classList.add('inactive');
      } else {
        activeFilters.add(sev);
        chip.classList.add('active');
        chip.classList.remove('inactive');
      }
      if (activeFilters.size === 0) {
        document.querySelectorAll('.sev-chip').forEach(function(c) { c.classList.remove('inactive'); });
      }
      applyFilters();
    });
  });

  // ── Errors-only / Warnings-only quick filter ─────────────────
  document.querySelectorAll('.filter-btn[data-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var wasActive = btn.classList.contains('active');
      document.querySelectorAll('.filter-btn[data-filter]').forEach(function(b) {
        b.classList.remove('active');
      });
      activeFilters.clear();
      document.querySelectorAll('.sev-chip').forEach(function(c) {
        c.classList.remove('active', 'inactive');
      });
      if (!wasActive) {
        btn.classList.add('active');
        var filter = btn.dataset.filter;
        if (filter === 'errors') {
          ['critical','high','error'].forEach(function(s) { activeFilters.add(s); });
        } else if (filter === 'warnings') {
          ['moderate','warning','low','info','hint'].forEach(function(s) { activeFilters.add(s); });
        }
      }
      applyFilters();
    });
  });

  function applyFilters() {
    var query = searchInput ? searchInput.value.toLowerCase() : '';
    var sections = document.querySelectorAll('.file-section[data-file]');
    var visibleCount = 0;

    sections.forEach(function(section) {
      var filePath  = (section.dataset.file || '').toLowerCase();
      var matchSearch = !query || filePath.includes(query);

      var violations = section.querySelectorAll('.violation[data-sev]');
      var anyVisible = false;

      violations.forEach(function(v) {
        var sev = v.dataset.sev || '';
        var msg = (v.dataset.msg || '').toLowerCase();
        var rule = (v.dataset.rule || '').toLowerCase();
        var matchSev    = activeFilters.size === 0 || activeFilters.has(sev);
        var matchText   = !query || msg.includes(query) || rule.includes(query) || filePath.includes(query);
        var show = matchSev && matchText;
        v.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });

      var show = matchSearch && anyVisible;
      section.classList.toggle('hidden', !show);
      if (show) visibleCount++;
    });

    if (noResults) {
      noResults.classList.toggle('visible', visibleCount === 0 && sections.length > 0);
    }
  }

  // ── Open first N files by default ────────────────────────────
  var firstFiles = document.querySelectorAll('.file-section');
  var limit = Math.min(3, firstFiles.length);
  for (var i = 0; i < limit; i++) { firstFiles[i].classList.add('open'); }
})();
`;
}

// ---------------------------------------------------------------------------
// Angular SVG logo
// ---------------------------------------------------------------------------

function angularLogo(): string {
    return `<svg class="ng-logo" viewBox="0 0 250 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon fill="#DD0031" points="125,30 125,30 125,30 31.9,63.2 46.1,186.3 125,230 125,230 125,230 203.9,186.3 218.1,63.2"/>
  <polygon fill="#C3002F" points="125,30 125,52.2 125,52.1 125,153.4 125,153.4 125,230 125,230 203.9,186.3 218.1,63.2"/>
  <path fill="#FFFFFF" d="M125,52.1L66.8,182.6h0h21.7h0l11.7-29.2h49.4l11.7,29.2h0h21.7h0L125,52.1L125,52.1z M142,135.4H108l17-40.9L142,135.4z"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Per-file violation HTML builder
// ---------------------------------------------------------------------------

interface SeverityCount { [sev: string]: number }

function buildFileSection(
    filePath: string,
    failures: RuleFailure[],
    index: number,
): string {
    const rel = relativeToRoot(filePath);
    const dirPart = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/') + 1) : '';
    const namePart = rel.includes('/') ? rel.substring(rel.lastIndexOf('/') + 1) : rel;

    // Sort by severity rank then position
    const sorted = [...failures].sort((a, b) => {
        const sr = severityRank(a.severity) - severityRank(b.severity);
        if (sr !== 0) return sr;
        return compareByPosition(a, b);
    });

    const errCount  = sorted.filter(f => isErrorSeverity(f.severity)).length;
    const warnCount = sorted.length - errCount;

    const countPills = [
        errCount  > 0 ? `<span class="count-pill err">${errCount} error${errCount !== 1 ? 's' : ''}</span>` : '',
        warnCount > 0 ? `<span class="count-pill warn">${warnCount} warning${warnCount !== 1 ? 's' : ''}</span>` : '',
    ].filter(Boolean).join('');

    const rows = sorted.map(f => {
        const cls   = severityColorClass(f.severity);
        const fix   = f.fix ? `<div class="violation-fix">${escapeHtml(f.fix)}</div>` : '';
        const loc   = `${f.line}:${f.column}`;
        const msg   = escapeHtml(f.message.replace(/\.$/, ''));
        const rule  = escapeHtml(f.ruleName);
        return `<div class="violation" data-sev="${escapeHtml(f.severity)}" data-msg="${msg.toLowerCase()}" data-rule="${rule.toLowerCase()}">
  <span class="sev-badge ${cls}">${escapeHtml(f.severity)}</span>
  <div class="violation-body">
    <div class="violation-msg">${msg}</div>
    <div class="violation-rule">${rule}</div>
    ${fix}
  </div>
  <div class="violation-loc">${escapeHtml(loc)}</div>
</div>`;
    }).join('\n');

    return `<div class="file-section" data-file="${escapeHtml(rel.toLowerCase())}" id="file-${index}">
  <div class="file-header">
    <span class="file-chevron">▶</span>
    <span class="file-path">
      <span class="path-dir">${escapeHtml(dirPart)}</span><span class="path-name">${escapeHtml(namePart)}</span>
    </span>
    <span class="file-counts">${countPills}</span>
  </div>
  <div class="file-body">
    ${rows}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Full HTML document builder
// ---------------------------------------------------------------------------

function buildHtml(
    results: ReadonlyArray<RuleResult>,
    parseErrors: ReadonlyArray<ParseError>,
    summary: ResultSummary,
    generatedAt: Date,
): string {
    const allFailures  = results.flatMap(r => r.failures);
    const totalViolations = allFailures.length;
    const hasViolations   = totalViolations > 0 || parseErrors.length > 0;

    // Group by file and sort files by error count desc, then path
    const byFile = groupFailuresByFile(results);
    const sortedFiles = [...byFile.entries()].sort((a, b) => {
        const ae = a[1].filter(f => isErrorSeverity(f.severity)).length;
        const be = b[1].filter(f => isErrorSeverity(f.severity)).length;
        if (be !== ae) return be - ae;
        return relativeToRoot(a[0]).localeCompare(relativeToRoot(b[0]));
    });

    // Per-severity counts
    const sevCounts: SeverityCount = {};
    for (const f of allFailures) {
        sevCounts[f.severity] = (sevCounts[f.severity] ?? 0) + 1;
    }

    // Per-rule counts (top 10)
    const ruleCounts = new Map<string, number>();
    for (const f of allFailures) {
        ruleCounts.set(f.ruleName, (ruleCounts.get(f.ruleName) ?? 0) + 1);
    }
    const topRules = [...ruleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const maxRuleCount = topRules.length > 0 ? topRules[0][1] : 1;

    // Status
    const passed = summary.totalErrors === 0 && parseErrors.length === 0;

    // Severity chips (only visible severities)
    const SEV_ORDER = ['critical','high','error','moderate','warning','low','info','hint'];
    const sevChips = SEV_ORDER
        .filter(s => sevCounts[s] > 0)
        .map(s => `<span class="sev-chip ${severityColorClass(s)}" data-sev="${s}">
  ${s} <span class="chip-count">${sevCounts[s]}</span>
</span>`).join('\n');

    // Rules breakdown section
    const rulesBreakdownHtml = topRules.length > 1 ? `
<div class="rules-breakdown">
  <div class="rules-breakdown-title">Top Rules by Violations</div>
  ${topRules.map(([name, count]) => {
      const pct = Math.round((count / maxRuleCount) * 100);
      return `<div class="rule-row">
    <span class="rule-name-col">${escapeHtml(name)}</span>
    <div class="rule-bar-wrap"><div class="rule-bar-fill" style="width:${pct}%"></div></div>
    <span class="rule-count-col">${count}</span>
  </div>`;
  }).join('\n')}
</div>` : '';

    // File sections
    const fileSectionsHtml = sortedFiles.length === 0
        ? `<div class="empty-state">
  <div class="empty-icon">✅</div>
  <div class="empty-title">No violations found</div>
  <div class="empty-sub">Your Angular project looks clean!</div>
</div>`
        : sortedFiles.map(([fp, failures], i) => buildFileSection(fp, failures, i)).join('\n');

    // Parse errors section
    const parseErrorsHtml = parseErrors.length > 0 ? `
<section style="margin-bottom:36px">
  <div class="section-title">Parse Errors (${parseErrors.length})</div>
  ${parseErrors.map(e => `<div class="parse-error-item">
    <span class="parse-error-icon">⚠</span>
    <div>
      <div class="parse-error-path">${escapeHtml(relativeToRoot(e.filePath))}</div>
      <div class="parse-error-msg">${escapeHtml(e.message)}</div>
    </div>
  </div>`).join('\n')}
</section>` : '';

    // Cached info
    const cachedInfo = summary.cachedTasks !== undefined
        ? `<span>${summary.cachedTasks.toLocaleString()} task${summary.cachedTasks !== 1 ? 's' : ''} from cache</span>`
        : '';

    const ts = generatedAt.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ngcompass — Analysis Report</title>
  <style>${buildStyles()}</style>
</head>
<body>

<!-- ══ HEADER ══════════════════════════════════════════════════════ -->
<header class="header">
  <div class="header-inner">
    <div class="brand">
      ${angularLogo()}
      <div class="brand-text">
        <h1>ng<span>compass</span></h1>
        <p>Angular Static Analysis Report</p>
      </div>
    </div>
    <div class="header-meta">
      <div><strong>Generated:</strong> ${escapeHtml(ts)}</div>
      <div><strong>Project:</strong> ${escapeHtml(relativeToRoot(process.cwd()) || path.basename(process.cwd()))}</div>
      <div><strong>Duration:</strong> ${escapeHtml(formatDuration(summary.duration))}</div>
    </div>
  </div>
</header>

<!-- ══ STATUS BANNER ════════════════════════════════════════════════ -->
<div class="status-banner ${passed ? 'pass' : 'fail'}">
  <span class="status-dot"></span>
  ${passed
    ? 'Analysis passed — no violations found'
    : `Analysis completed with ${summary.totalErrors.toLocaleString()} error${summary.totalErrors !== 1 ? 's' : ''} and ${summary.totalWarnings.toLocaleString()} warning${summary.totalWarnings !== 1 ? 's' : ''}`}
</div>

<!-- ══ MAIN ═════════════════════════════════════════════════════════ -->
<main class="main">

  <!-- Summary cards -->
  <div class="summary-grid">
    <div class="stat-card errors">
      <div class="stat-label">Errors</div>
      <div class="stat-value">${summary.totalErrors.toLocaleString()}</div>
      <div class="stat-sub">Critical / High / Error</div>
    </div>
    <div class="stat-card warnings">
      <div class="stat-label">Warnings</div>
      <div class="stat-value">${summary.totalWarnings.toLocaleString()}</div>
      <div class="stat-sub">Moderate / Low / Info</div>
    </div>
    <div class="stat-card files">
      <div class="stat-label">Files Scanned</div>
      <div class="stat-value">${summary.totalFiles.toLocaleString()}</div>
      <div class="stat-sub">${sortedFiles.length} file${sortedFiles.length !== 1 ? 's' : ''} with issues</div>
    </div>
    <div class="stat-card duration">
      <div class="stat-label">Duration</div>
      <div class="stat-value">${escapeHtml(formatDuration(summary.duration))}</div>
      <div class="stat-sub">${escapeHtml(cachedInfo || `${summary.totalTasks.toLocaleString()} tasks`)}</div>
    </div>
    ${topRules.length > 0 ? `<div class="stat-card rules">
      <div class="stat-label">Rules Triggered</div>
      <div class="stat-value">${ruleCounts.size}</div>
      <div class="stat-sub">${totalViolations.toLocaleString()} total violation${totalViolations !== 1 ? 's' : ''}</div>
    </div>` : ''}
  </div>

  ${parseErrorsHtml}

  ${hasViolations ? `
  <!-- Severity breakdown chips -->
  ${sevChips.length > 0 ? `<div class="severity-bar">${sevChips}</div>` : ''}

  <!-- Top rules chart -->
  ${rulesBreakdownHtml}

  <!-- Violations section -->
  <section>
    <div class="section-title">Violations by File (${sortedFiles.length})</div>

    <!-- Controls -->
    <div class="controls">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input
          id="searchInput"
          class="search-input"
          type="search"
          placeholder="Search files, rules, messages…"
          autocomplete="off"
          spellcheck="false"
        >
      </div>
      <button class="filter-btn" data-filter="errors">Errors only</button>
      <button class="filter-btn" data-filter="warnings">Warnings only</button>
      <button class="expand-btn" id="expandAll">Expand all</button>
      <button class="expand-btn" id="collapseAll">Collapse all</button>
    </div>

    <!-- File sections -->
    ${fileSectionsHtml}
    <div class="no-results" id="noResults">No violations match your current filters.</div>
  </section>
  ` : fileSectionsHtml}

</main>

<!-- ══ FOOTER ═══════════════════════════════════════════════════════ -->
<footer class="footer">
  <span>Generated by <a href="https://github.com/ngcompass/ngcompass" target="_blank" rel="noopener">ngcompass</a> — Angular Static Analysis</span>
  <span>${escapeHtml(ts)}</span>
</footer>

<script>${buildScript()}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HtmlReporter class
// ---------------------------------------------------------------------------

/**
 * HTML reporter — accumulates results in memory and writes a self-contained
 * HTML file on `summary()`.
 *
 * All progress methods (step / info / debug) are no-ops so that stdout
 * remains clean when the user redirects output.
 */
export class HtmlReporter implements Reporter {
    private readonly accumulatedResults: RuleResult[] = [];
    private readonly accumulatedParseErrors: ParseError[] = [];

    constructor(
        /** Absolute or relative path for the HTML output file. */
        private readonly outputPath: string = DEFAULT_OUTPUT_PATH,
        private readonly out: ReporterOutput = processOutput,
    ) {}

    report(results: ReadonlyArray<RuleResult>): void {
        for (const r of results) {
            this.accumulatedResults.push(r);
        }
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        for (const e of errors) {
            this.accumulatedParseErrors.push(e);
        }
    }

    error(error: Error): void {
        // Write error to stderr so it's visible even when stdout is piped
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
            // Confirmation goes to stderr so it doesn't pollute any pipes on stdout
            this.out.error(
                `\n✓ HTML report saved to: ${path.relative(process.cwd(), absPath) || absPath}\n`,
            );
        } catch (writeErr) {
            this.out.error(
                `[ngcompass] Failed to write HTML report to ${absPath}: ${(writeErr as Error).message}`,
            );
        }
    }

    // ── ProgressReporter no-ops (keep stdout clean) ──────────────────────

    step(_message: string): void { /* no-op */ }
    info(_message: string): void { /* no-op */ }
    debug(_message: string): void { /* no-op */ }
}
