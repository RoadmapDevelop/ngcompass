import { describe, it, expect } from 'vitest';
import { templatePreferControlFlowRule } from '../src/rules/template/template-prefer-control-flow.rule.js';
import { templateNoAsyncPipeDuplicationRule } from '../src/rules/template/template-no-async-pipe-duplication.rule.js';
import { makeContext } from './helpers.js';

describe('template-prefer-control-flow', () => {
  it('has correct name and streamType', () => {
    expect(templatePreferControlFlowRule.name).toBe(
      'template-prefer-control-flow'
    );
    expect(templatePreferControlFlowRule.streamType).toBe('TemplateAttribute');
  });

  it('flags *ngIf attribute', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      name: '*ngIf',
      sourceSpan: { start: 0, end: 5 },
    } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    expect((result as any).ruleName).toBe('template-prefer-control-flow');
    expect((result as any).message).toContain('@if');
    expect((result as any).severity).toBe('error');
  });

  it('flags *ngFor attribute', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      name: '*ngFor',
      sourceSpan: { start: 0, end: 6 },
    } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    expect((result as any).message).toContain('@for');
  });

  it('flags *ngSwitch attribute', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      name: '*ngSwitch',
      sourceSpan: { start: 0, end: 9 },
    } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    expect((result as any).message).toContain('@switch');
  });

  it('flags [ngSwitch] attribute', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      name: '[ngSwitch]',
      sourceSpan: { start: 0, end: 9 },
    } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
  });

  it('flags *ngSwitchCase attribute', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      name: '*ngSwitchCase',
      sourceSpan: { start: 0, end: 12 },
    } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
  });

  it('does NOT flag a modern @if element', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = { name: 'class', sourceSpan: { start: 0, end: 5 } } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag arbitrary non-directive attributes', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = { name: 'id', sourceSpan: { start: 0, end: 2 } } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('contains a fix recommendation', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = { name: '*ngIf', sourceSpan: { start: 0, end: 5 } } as any;
    const result = templatePreferControlFlowRule.handle(fakeNode, ctx) as any;
    expect(result?.fix).toBeDefined();
  });
});

describe('template-no-async-pipe-duplication', () => {
  it('has correct name and streamType', () => {
    expect(templateNoAsyncPipeDuplicationRule.name).toBe(
      'template-no-async-pipe-duplication'
    );
    expect(templateNoAsyncPipeDuplicationRule.streamType).toBe(
      'TemplateExpression'
    );
  });

  it('flags a duplicate async pipe on the same observable', () => {
    const ctx = makeContext('', '/src/app.component.ts');

    const makeAsyncPipeNode = (obsName: string) => ({
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: { type: 'Identifier', name: obsName },
        right: { type: 'Identifier', name: 'async' },
      },
      sourceSpan: { start: 0, end: 20 },
    });

    const first = templateNoAsyncPipeDuplicationRule.handle(
      makeAsyncPipeNode('data$') as any,
      ctx
    );
    expect(first).toBeNull();

    const second = templateNoAsyncPipeDuplicationRule.handle(
      makeAsyncPipeNode('data$') as any,
      ctx
    );
    expect(second).not.toBeNull();
    expect((second as any).ruleName).toBe('template-no-async-pipe-duplication');
    expect((second as any).message).toContain('data$');
  });

  it('does NOT flag two different observables with async pipe', () => {
    const ctx = makeContext('', '/src/app.component.ts');

    const makeAsyncPipeNode = (obsName: string) => ({
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: { type: 'Identifier', name: obsName },
        right: { type: 'Identifier', name: 'async' },
      },
      sourceSpan: { start: 0, end: 20 },
    });

    const first = templateNoAsyncPipeDuplicationRule.handle(
      makeAsyncPipeNode('users$') as any,
      ctx
    );
    expect(first).toBeNull();

    const second = templateNoAsyncPipeDuplicationRule.handle(
      makeAsyncPipeNode('orders$') as any,
      ctx
    );
    expect(second).toBeNull();
  });

  it('does NOT flag an expression without an async pipe', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: { type: 'Identifier', name: 'title' },
      sourceSpan: { start: 0, end: 5 },
    } as any;
    const result = templateNoAsyncPipeDuplicationRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag a non-async pipe (e.g. date pipe)', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: { type: 'Identifier', name: 'today' },
        right: { type: 'Identifier', name: 'date' },
      },
      sourceSpan: { start: 0, end: 15 },
    } as any;
    const result = templateNoAsyncPipeDuplicationRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('flags duplicate async pipe with logical OR expression', () => {
    const ctx = makeContext('', '/src/async-logical-a.component.ts');

    const makeLogicalAsyncNode = () => ({
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: {
          type: 'LogicalExpression',
          operator: '||',
          left: { type: 'Identifier', name: 'data$' },
          right: { type: 'Identifier', name: 'fallback$' },
        },
        right: { type: 'Identifier', name: 'async' },
      },
      sourceSpan: { start: 0, end: 30 },
    });

    const first = templateNoAsyncPipeDuplicationRule.handle(
      makeLogicalAsyncNode() as any,
      ctx
    );
    expect(first).toBeNull();

    const second = templateNoAsyncPipeDuplicationRule.handle(
      makeLogicalAsyncNode() as any,
      ctx
    );
    expect(second).not.toBeNull();
  });

  it('does NOT flag different logical expressions as duplicates', () => {
    const ctx = makeContext('', '/src/async-logical-b.component.ts');

    const makeLogicalAsyncNode = (rightName: string) => ({
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: {
          type: 'LogicalExpression',
          operator: '||',
          left: { type: 'Identifier', name: 'a$' },
          right: { type: 'Identifier', name: rightName },
        },
        right: { type: 'Identifier', name: 'async' },
      },
      sourceSpan: { start: 0, end: 30 },
    });

    const first = templateNoAsyncPipeDuplicationRule.handle(
      makeLogicalAsyncNode('b$') as any,
      ctx
    );
    expect(first).toBeNull();

    const second = templateNoAsyncPipeDuplicationRule.handle(
      makeLogicalAsyncNode('c$') as any,
      ctx
    );
    expect(second).toBeNull();
  });

  it('flags duplicate async pipe with non-pipe binary expression', () => {
    const ctx = makeContext('', '/src/async-binary-c.component.ts');

    const makeBinaryAsyncNode = () => ({
      expression: {
        type: 'BinaryExpression',
        operator: '|',
        left: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'count$' },
          right: { type: 'Literal', value: 1 },
        },
        right: { type: 'Identifier', name: 'async' },
      },
      sourceSpan: { start: 0, end: 30 },
    });

    const first = templateNoAsyncPipeDuplicationRule.handle(
      makeBinaryAsyncNode() as any,
      ctx
    );
    expect(first).toBeNull();

    const second = templateNoAsyncPipeDuplicationRule.handle(
      makeBinaryAsyncNode() as any,
      ctx
    );
    expect(second).not.toBeNull();
  });
});
