import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers.js';
import { templateNoCallExpressionRule } from '../src/rules/performance/template-no-call-expression.rule.js';

describe('template-no-call-expression (repro)', () => {
  it('flags a call with arguments', () => {
    const ctx = makeContext('', '/src/app.component.ts');

    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'doSomething' },
        arguments: [{ type: 'Literal', value: 123 }],
      },
      sourceSpan: { start: 10, end: 30 },
    } as any;

    const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(1);
  });

  it('flags a zero-argument call like getTitle()', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'getTitle' },
        arguments: [],
      },
      sourceSpan: { start: 10, end: 20 },
    } as any;

    const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(1);
  });

  it('flags is-prefixed zero-argument methods unless they are known signals', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'isLoggedIn' },
        arguments: [],
      },
      sourceSpan: { start: 10, end: 22 },
    } as any;

    const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(1);
  });

  it('does NOT flag is-prefixed calls when the component member is a signal', () => {
    const ctx = {
      ...makeContext('', '/src/app.component.html'),
      crossRef: {
        componentPath: '/src/app.component.ts',
        templatePath: '/src/app.component.html',
        stylePaths: [],
        signalMembers: new Set(['isLoggedIn']),
      },
    };
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'isLoggedIn' },
        arguments: [],
      },
      sourceSpan: { start: 10, end: 22 },
    } as any;

    const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(results).toBeNull();
  });

  it('flags title() when the call name cannot be proven to be a signal', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'title' },
        arguments: [],
      },
      sourceSpan: { start: 10, end: 17 },
    } as any;

    const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(1);
  });
});
