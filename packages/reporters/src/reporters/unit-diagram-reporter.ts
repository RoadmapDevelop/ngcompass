import type {
  FileUnitGraph,
  LaneKind,
  LaneStatus,
  UnitBox,
  UnitLane,
} from '@ngcompass/common';

const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

const HTML_ESCAPE_RE = /[&<>"']/g;
const SCRIPT_CLOSE_RE = /<\//g;
const LINE_SEPARATOR_RE = /\u2028/g;
const PARAGRAPH_SEPARATOR_RE = /\u2029/g;

const LANE_LABELS: ReadonlyMap<LaneKind, string> = new Map([
  ['ts', 'TypeScript'],
  ['template', 'Template'],
  ['styles', 'Styles'],
  ['spec', 'Spec'],
  ['dependency', 'Dependency'],
]);

const STATUS_NOTES: ReadonlyMap<LaneStatus, string> = new Map([
  ['inline', 'inline in decorator'],
  ['declared-missing', 'declared but not found on disk'],
  ['unparseable', 'could not be parsed'],
]);

export function escapeHtml(text: string): string {
  HTML_ESCAPE_RE.lastIndex = 0;
  return text.replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPES.get(char) ?? char);
}

export function escapeForScript(json: string): string {
  return json
    .replace(SCRIPT_CLOSE_RE, '<\\/')
    .replace(LINE_SEPARATOR_RE, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR_RE, '\\u2029');
}

function renderLocation(box: UnitBox): string {
  if (box.line === 0) return '';
  return `<span class="loc">${box.line}:${box.column}</span>`;
}

function renderBox(box: UnitBox): string {
  return (
    `<li class="box kind-${escapeHtml(box.kind)}" data-box="${escapeHtml(box.id)}">` +
    `<span class="name">${escapeHtml(box.name)}</span>` +
    renderLocation(box) +
    `</li>`
  );
}

function renderStatusNote(status: LaneStatus): string {
  const note = STATUS_NOTES.get(status);
  if (!note) return '';
  return `<p class="status status-${escapeHtml(status)}">${escapeHtml(note)}</p>`;
}

function renderLane(lane: UnitLane): string {
  const kindLabel = LANE_LABELS.get(lane.kind) ?? lane.kind;
  const boxes =
    lane.boxes.length > 0
      ? `<ul class="boxes">${lane.boxes.map(renderBox).join('')}</ul>`
      : `<p class="empty">no symbols</p>`;

  return (
    `<section class="lane lane-${escapeHtml(lane.kind)}" data-lane="${escapeHtml(lane.id)}">` +
    `<header><span class="lane-kind">${escapeHtml(kindLabel)}</span>` +
    `<h2>${escapeHtml(lane.label)}</h2></header>` +
    renderStatusNote(lane.status) +
    boxes +
    `</section>`
  );
}

function renderSummary(graph: FileUnitGraph): string {
  const boxCount = graph.lanes.reduce((sum, lane) => sum + lane.boxes.length, 0);
  const name = graph.className ?? graph.entryFile;
  return (
    `<p class="summary">${escapeHtml(name)} — ` +
    `${graph.lanes.length} lanes, ${boxCount} symbols, ${graph.edges.length} edges</p>`
  );
}

function buildStyles(): string {
  return `
:root { color-scheme: light dark; --bg:#f7f8fa; --fg:#14161a; --line:#d7dae0;
  --card:#fff; --muted:#6b7280; --ts:#2f9e5e; --template:#3b82f6; --styles:#0d9488;
  --spec:#ea8034; --dependency:#d946ef; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --fg:#e6e8ec;
  --line:#2a2f38; --card:#161a21; --muted:#9aa3b2; } }
:root[data-theme="dark"] { --bg:#0f1115; --fg:#e6e8ec; --line:#2a2f38;
  --card:#161a21; --muted:#9aa3b2; }
:root[data-theme="light"] { --bg:#f7f8fa; --fg:#14161a; --line:#d7dae0;
  --card:#fff; --muted:#6b7280; }
* { box-sizing: border-box; }
body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
  font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif; }
h1 { font-size:18px; margin:0 0 4px; }
.summary { color:var(--muted); margin:0 0 20px; }
.stage { position:relative; }
.lanes { display:flex; gap:18px; align-items:flex-start; overflow-x:auto;
  padding-bottom:12px; }
.lane { flex:0 0 240px; background:var(--card); border:2px solid var(--line);
  border-radius:14px; padding:12px; }
.lane-ts { border-color:var(--ts); } .lane-template { border-color:var(--template); }
.lane-styles { border-color:var(--styles); } .lane-spec { border-color:var(--spec); }
.lane-dependency { border-color:var(--dependency); }
.lane header { margin-bottom:10px; }
.lane-kind { font-size:11px; text-transform:uppercase; letter-spacing:.06em;
  color:var(--muted); }
.lane h2 { font-size:13px; margin:2px 0 0; word-break:break-all; }
.status { font-size:12px; margin:0 0 8px; color:var(--spec); }
.status-declared-missing, .status-unparseable { color:#dc2626; font-weight:600; }
.empty { color:var(--muted); font-size:12px; font-style:italic; margin:0; }
.boxes { list-style:none; margin:0; padding:0; display:flex; flex-direction:column;
  gap:8px; }
.box { border:2px solid var(--line); border-radius:10px; padding:6px 10px;
  background:var(--bg); display:flex; justify-content:space-between; gap:8px;
  align-items:baseline; transition:opacity .12s; }
.lane-ts .box { border-color:var(--ts); } .lane-template .box { border-color:var(--template); }
.lane-styles .box { border-color:var(--styles); } .lane-spec .box { border-color:var(--spec); }
.lane-dependency .box { border-color:var(--dependency); }
.name { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
  word-break:break-word; }
.loc { color:var(--muted); font-size:11px; white-space:nowrap; }
#wires { position:absolute; inset:0; pointer-events:none; overflow:visible; }
.wire { fill:none; stroke:var(--muted); stroke-width:2; opacity:.55; }
.wire-template-event { stroke:var(--template); }
.wire-template-binding { stroke:var(--ts); }
.wire-spec-usage { stroke:var(--spec); }
.wire-dependency-usage { stroke:var(--dependency); }
.dimmed { opacity:.12; }
.focused { opacity:1; }
`;
}

function buildScript(): string {
  return `
const graph = window.__unitGraph;
const stage = document.querySelector('.stage');
const svg = document.getElementById('wires');
const boxes = new Map();
for (const el of document.querySelectorAll('.box')) {
  boxes.set(el.dataset.box, el);
}

function centreRight(rect, base) {
  return { x: rect.right - base.left, y: rect.top + rect.height / 2 - base.top };
}
function centreLeft(rect, base) {
  return { x: rect.left - base.left, y: rect.top + rect.height / 2 - base.top };
}

function draw() {
  const base = stage.getBoundingClientRect();
  svg.setAttribute('viewBox', '0 0 ' + base.width + ' ' + base.height);
  svg.style.width = base.width + 'px';
  svg.style.height = base.height + 'px';
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  for (const edge of graph.edges) {
    const fromEl = boxes.get(edge.from);
    const toEl = boxes.get(edge.to);
    if (!fromEl || !toEl) continue;

    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const forward = a.left <= b.left;
    const start = forward ? centreRight(a, base) : centreLeft(a, base);
    const end = forward ? centreLeft(b, base) : centreRight(b, base);
    const dx = Math.max(28, Math.abs(end.x - start.x) / 2);
    const c1 = forward ? start.x + dx : start.x - dx;
    const c2 = forward ? end.x - dx : end.x + dx;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + start.x + ' ' + start.y + ' C' + c1 + ' ' +
      start.y + ' ' + c2 + ' ' + end.y + ' ' + end.x + ' ' + end.y);
    path.setAttribute('class', 'wire wire-' + edge.kind);
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    svg.appendChild(path);
  }
}

function focus(boxId) {
  const related = new Set([boxId]);
  for (const edge of graph.edges) {
    if (edge.from === boxId) related.add(edge.to);
    if (edge.to === boxId) related.add(edge.from);
  }
  for (const [id, el] of boxes) {
    el.classList.toggle('dimmed', !related.has(id));
  }
  for (const path of svg.querySelectorAll('path')) {
    const on = path.dataset.from === boxId || path.dataset.to === boxId;
    path.classList.toggle('dimmed', !on);
  }
}

function clearFocus() {
  for (const el of boxes.values()) el.classList.remove('dimmed');
  for (const path of svg.querySelectorAll('path')) path.classList.remove('dimmed');
}

for (const [id, el] of boxes) {
  el.addEventListener('mouseenter', () => focus(id));
  el.addEventListener('mouseleave', clearFocus);
}

draw();
window.addEventListener('resize', draw);
document.querySelector('.lanes').addEventListener('scroll', draw, { passive: true });
`;
}

export function renderUnitDiagram(graph: FileUnitGraph): string {
  const title = graph.className ?? graph.entryFile;
  const payload = escapeForScript(JSON.stringify({ edges: graph.edges }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ngcompass — ${escapeHtml(title)}</title>
<style>${buildStyles()}</style>
</head>
<body>
<h1>${escapeHtml(graph.entryFile)}</h1>
${renderSummary(graph)}
<div class="stage">
<svg id="wires" xmlns="http://www.w3.org/2000/svg"></svg>
<div class="lanes">${graph.lanes.map(renderLane).join('')}</div>
</div>
<script>window.__unitGraph = ${payload};</script>
<script>${buildScript()}</script>
</body>
</html>
`;
}
