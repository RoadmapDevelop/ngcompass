import { describe, it, expect } from 'vitest';
import { findCircularDependencies } from '../../src/project-graph/cycle-detector.js';

function graph(
  edges: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const [from, tos] of edges) {
    g.set(from, new Set(tos));
  }
  return g;
}

function canonical(cycle: ReadonlyArray<string>): string {
  const nodes = cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]
    ? cycle.slice(0, -1)
    : cycle.slice();
  let minIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i] < nodes[minIdx]) minIdx = i;
  }
  return [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)].join('|');
}

describe('findCircularDependencies', () => {
  it('returns an empty array for an empty graph', () => {
    expect(findCircularDependencies(new Map())).toEqual([]);
  });

  it('returns an empty array for an acyclic graph', () => {
    const g = graph([
      ['a', ['b', 'c']],
      ['b', ['c', 'd']],
      ['c', ['d']],
      ['d', []],
    ]);
    expect(findCircularDependencies(g)).toEqual([]);
  });

  it('detects a self-loop', () => {
    const g = graph([['a', ['a']]]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
    expect(canonical(cycles[0])).toBe('a');
  });

  it('detects a two-node cycle', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
    expect(canonical(cycles[0])).toBe('a|b');
  });

  it('detects a three-node cycle', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
    expect(canonical(cycles[0])).toBe('a|b|c');
  });

  it('deduplicates rotated views of the same cycle', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a', 'b']],
    ]);
    const cycles = findCircularDependencies(g);
    const keys = new Set(cycles.map(canonical));
    expect(keys.size).toBe(cycles.length);
  });

  it('finds disjoint cycles', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
      ['d', ['c']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(2);
    const keys = new Set(cycles.map(canonical));
    expect(keys.has('a|b')).toBe(true);
    expect(keys.has('c|d')).toBe(true);
  });

  it('includes the loop-back node in the displayed cycle', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles[0]).toEqual(['a', 'b', 'a']);
  });

  it('does not crash on a node with neighbors not present in the graph', () => {
    const g = graph([
      ['a', ['b', 'missing']],
      ['b', ['a']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
  });

  it('handles a linear chain that ends in a small cycle', () => {
    const g = graph([
      ['root', ['a']],
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['b']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
    expect(canonical(cycles[0])).toBe('b|c');
  });

  it('does not stack-overflow on a deep linear chain (10000 nodes)', () => {
    const g = new Map<string, Set<string>>();
    for (let i = 0; i < 10_000; i++) {
      g.set(`n${i}`, new Set([`n${i + 1}`]));
    }
    g.set('n10000', new Set());
    expect(() => findCircularDependencies(g)).not.toThrow();
    expect(findCircularDependencies(g)).toEqual([]);
  });

  it('does not stack-overflow on a deep cycle (10000 nodes)', () => {
    const g = new Map<string, Set<string>>();
    for (let i = 0; i < 10_000; i++) {
      g.set(`n${i}`, new Set([`n${(i + 1) % 10_000}`]));
    }
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(10_001);
  });

  it('finds two independent cycles in a graph with shared predecessors', () => {
    const g = graph([
      ['entry', ['x', 'y']],
      ['x', ['x2']],
      ['x2', ['x']],
      ['y', ['y2']],
      ['y2', ['y']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(2);
  });

  it('does not duplicate a cycle reached via multiple entry points', () => {
    const g = graph([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
      ['outer', ['a']],
    ]);
    const cycles = findCircularDependencies(g);
    expect(cycles.length).toBe(1);
  });
});
