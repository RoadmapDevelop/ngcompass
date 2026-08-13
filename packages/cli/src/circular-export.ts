import path from 'node:path';

import type { GraphExportPayload } from './models/index.js';
export function toJsonGraph(payload: GraphExportPayload): string {
  const nodes: string[] = [];
  const edges: Array<readonly [string, string]> = [];

  for (const [from, targets] of payload.graph) {
    const fromLabel = toRelative(from, payload.rootDir);
    nodes.push(fromLabel);
    for (const to of targets) {
      edges.push([fromLabel, toRelative(to, payload.rootDir)]);
    }
  }

  const base = {
    rootDir: payload.rootDir,
    generatedAt: payload.generatedAt.toISOString(),
    fileCount: payload.fileCount,
    focus: payload.focus ?? null,
    depth: payload.focus ? payload.depth : null,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };

  if (payload.cycles === undefined) {
    return JSON.stringify(base, null, 2) + '\n';
  }

  const cycles = payload.cycles.map((cycle) =>
    cycle.map((file) => toRelative(file, payload.rootDir))
  );

  return JSON.stringify({ ...base, cycleCount: cycles.length, cycles }, null, 2) + '\n';
}

function toRelative(file: string, rootDir: string): string {
  const rel = path.relative(rootDir, file);
  return (rel || file).replace(/\\/g, '/');
}
