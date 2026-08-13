import { parseTs } from '@ngcompass/ast';
import { Locator } from '@ngcompass/common';
import { computeFileComplexity } from '../../src/complexity/complexity-analyzer.js';
import type { FunctionComplexity } from '../../src/models/index.js';

function analyze(source: string): readonly FunctionComplexity[] {
  const { program } = parseTs(source, 'sample.ts');
  return computeFileComplexity(program, new Locator(source));
}

function byName(
  functions: readonly FunctionComplexity[],
  name: string
): FunctionComplexity {
  const match = functions.find((fn) => fn.name === name);
  if (!match) throw new Error(`function ${name} not found`);
  return match;
}

describe('computeFileComplexity', () => {
  it('scores a straight-line function as cyclomatic 1 and cognitive 0', () => {
    const [fn] = analyze('function plain() { return 1; }');
    expect(fn.cyclomatic).toBe(1);
    expect(fn.cognitive).toBe(0);
  });

  it('counts an if/else as cyclomatic 2 and cognitive 2', () => {
    const [fn] = analyze(
      'function branch(x: number) { if (x) { return 1; } else { return 2; } }'
    );
    expect(fn.cyclomatic).toBe(2);
    expect(fn.cognitive).toBe(2);
  });

  it('counts each distinct boolean operator run for cognitive complexity', () => {
    const [fn] = analyze('function logic(a, b, c) { return a && b || c; }');
    expect(fn.cyclomatic).toBe(3);
    expect(fn.cognitive).toBe(2);
  });

  it('adds nesting weight to deeply nested structures', () => {
    const [fn] = analyze(`
      function nested(items: number[]) {
        for (const i of items) {
          if (i > 0) {
            while (i) { i--; }
          }
        }
      }
    `);
    expect(fn.cyclomatic).toBe(4);
    expect(fn.cognitive).toBe(6);
  });

  it('counts non-default switch cases for cyclomatic complexity', () => {
    const [fn] = analyze(`
      function pick(x: number) {
        switch (x) {
          case 1: return 1;
          case 2: return 2;
          default: return 0;
        }
      }
    `);
    expect(fn.cyclomatic).toBe(3);
    expect(fn.cognitive).toBe(1);
  });

  it('counts catch clauses', () => {
    const [fn] = analyze(
      'function risky() { try { go(); } catch (e) { handle(e); } }'
    );
    expect(fn.cyclomatic).toBe(2);
    expect(fn.cognitive).toBe(1);
  });

  it('scores nested functions independently', () => {
    const functions = analyze(`
      function outer(x: number) {
        if (x) { return 1; }
        function inner(y: number) {
          if (y) { return 2; }
        }
      }
    `);
    expect(functions).toHaveLength(2);
    expect(byName(functions, 'outer').cyclomatic).toBe(2);
    expect(byName(functions, 'inner').cyclomatic).toBe(2);
  });

  it('names and classifies arrows assigned to variables', () => {
    const [fn] = analyze('const choose = (x: number) => (x ? 1 : 2);');
    expect(fn.name).toBe('choose');
    expect(fn.kind).toBe('arrow');
    expect(fn.cyclomatic).toBe(2);
    expect(fn.cognitive).toBe(1);
  });

  it('classifies class methods and accessors', () => {
    const functions = analyze(`
      class Widget {
        update() { if (true) { return; } }
        get label() { return 'x'; }
      }
    `);
    expect(byName(functions, 'update').kind).toBe('method');
    expect(byName(functions, 'label').kind).toBe('getter');
  });
});
