import { parseTs } from '@ngcompass/ast';
import { Locator } from '@ngcompass/common';
import { computeFileCallGraph } from '../../src/callgraph/call-graph-analyzer.js';
import type { CallGraphNode, FileCallGraph } from '../../src/models/index.js';

function analyze(source: string): FileCallGraph {
  const { program } = parseTs(source, 'sample.ts');
  return computeFileCallGraph(program, new Locator(source));
}

function nodeByName(graph: FileCallGraph, name: string): CallGraphNode {
  const match = graph.nodes.find((node) => node.name === name);
  if (!match) throw new Error(`node ${name} not found`);
  return match;
}

describe('computeFileCallGraph', () => {
  it('links a caller to a callee defined in the same file', () => {
    const graph = analyze(`
      function helper() { return 1; }
      function main() { return helper(); }
    `);

    const main = nodeByName(graph, 'main');
    const helper = nodeByName(graph, 'helper');
    const edge = graph.edges.find((e) => e.from === main.id);

    expect(edge?.to).toBe(helper.id);
    expect(edge?.ambiguous).toBe(false);
  });

  it('resolves a this.method() call to a method in the same class', () => {
    const graph = analyze(`
      class Service {
        load() { return this.fetch(); }
        fetch() { return 1; }
      }
    `);

    const load = nodeByName(graph, 'load');
    const fetch = nodeByName(graph, 'fetch');
    const edge = graph.edges.find((e) => e.from === load.id);

    expect(edge?.to).toBe(fetch.id);
  });

  it('records a call to an undefined symbol as an external call', () => {
    const graph = analyze(`
      function main() { return imported(); }
    `);

    expect(graph.edges).toHaveLength(0);
    expect(graph.externalCalls).toHaveLength(1);
    expect(graph.externalCalls[0]?.callName).toBe('imported');
    expect(graph.externalCalls[0]?.from).toBe(nodeByName(graph, 'main').id);
  });

  it('attributes a nested call to the innermost enclosing function', () => {
    const graph = analyze(`
      function target() { return 1; }
      function outer() {
        const inner = () => target();
        return inner;
      }
    `);

    const inner = nodeByName(graph, 'inner');
    const target = nodeByName(graph, 'target');
    const edge = graph.edges.find((e) => e.to === target.id);

    expect(edge?.from).toBe(inner.id);
  });

  it('labels an unnamed callback by the call it is passed to', () => {
    const graph = analyze(`
      function setup(items: number[]) {
        return items.map((x) => x * 2);
      }
      setTimeout(() => setup([1]), 0);
    `);

    expect(graph.nodes.some((n) => n.name === 'map callback')).toBe(true);
    expect(graph.nodes.some((n) => n.name === 'setTimeout callback')).toBe(true);
    expect(graph.nodes.some((n) => n.name === '<anonymous>')).toBe(false);
  });

  it('keeps a bound or declared name over a callback label', () => {
    const graph = analyze(`
      const handler = () => 1;
      run(handler);
      run(function inner() { return 2; });
    `);

    expect(graph.nodes.some((n) => n.name === 'inner')).toBe(true);
    expect(graph.nodes.some((n) => n.name === 'run callback')).toBe(false);
  });

  it('links a top-level call to a same-file definition instead of marking it external', () => {
    const graph = analyze(`
      function helper() { return 1; }
      helper();
    `);

    const helper = nodeByName(graph, 'helper');
    const edge = graph.edges.find((e) => e.to === helper.id);

    expect(edge?.from).toBeNull();
    expect(graph.externalCalls.some((c) => c.callName === 'helper')).toBe(false);
  });

  it('flags edges as ambiguous when multiple definitions share a name', () => {
    const graph = analyze(`
      class A { run() { return this.step(); } step() { return 1; } }
      class B { step() { return 2; } }
    `);

    const stepEdges = graph.edges.filter((e) => e.callName === 'step');
    expect(stepEdges.length).toBe(2);
    expect(stepEdges.every((e) => e.ambiguous)).toBe(true);
  });
});
