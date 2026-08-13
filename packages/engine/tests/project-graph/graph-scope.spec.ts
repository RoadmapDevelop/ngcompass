import { describe, it, expect } from 'vitest';
import {
  buildReverseAdjacency,
  collectNeighborhood,
  scopeGraphToNodes,
  filterCyclesByNeighborhood,
} from '../../src/project-graph/graph-scope.js';

function graph(
  edges: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const [from, tos] of edges) {
    g.set(from, new Set(tos));
  }
  return g;
}

describe('buildReverseAdjacency', () => {
  it('inverts every edge', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    const reverse = buildReverseAdjacency(g);
    expect([...(reverse.get('b') ?? [])]).toEqual(['a']);
    expect([...(reverse.get('c') ?? [])]).toEqual(['b']);
    expect(reverse.get('a')).toBeUndefined();
  });
});

describe('collectNeighborhood', () => {
  it('returns only the focus file at depth 0', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect([...collectNeighborhood(g, 'b', 0)]).toEqual(['b']);
  });

  it('includes both importers and imports at depth 1', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect([...collectNeighborhood(g, 'b', 1)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('stops expanding when the frontier is exhausted', () => {
    const g = graph([
      ['a', ['b']],
      ['b', []],
    ]);
    expect([...collectNeighborhood(g, 'a', 10)].sort()).toEqual(['a', 'b']);
  });
});

describe('scopeGraphToNodes', () => {
  it('keeps only edges between retained nodes', () => {
    const g = graph([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', []],
    ]);
    const scoped = scopeGraphToNodes(g, new Set(['a', 'b']));
    expect([...scoped.keys()].sort()).toEqual(['a', 'b']);
    expect([...(scoped.get('a') ?? [])]).toEqual(['b']);
    expect([...(scoped.get('b') ?? [])]).toEqual([]);
  });
});

describe('filterCyclesByNeighborhood', () => {
  it('keeps cycles that touch the neighborhood and drops the rest', () => {
    const cycles = [
      ['a', 'b', 'a'],
      ['x', 'y', 'x'],
    ];
    const kept = filterCyclesByNeighborhood(cycles, new Set(['b']));
    expect(kept).toEqual([['a', 'b', 'a']]);
  });
});
