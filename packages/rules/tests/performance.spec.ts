import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { preferOnPushRule } from '../src/rules/performance/prefer-on-push.rule.js';
import { templateNoCallExpressionRule } from '../src/rules/performance/template-no-call-expression.rule.js';
import { templateNoArrayLiteralBindingRule } from '../src/rules/performance/template-no-array-literal-binding.rule.js';
import { templateNoObjectLiteralBindingRule } from '../src/rules/performance/template-no-object-literal-binding.rule.js';
import { templateTrackByRequiredRule } from '../src/rules/performance/template-trackby-required.rule.js';

describe('prefer-on-push-component-change-detection', () => {
  it('has correct name and streamType', () => {
    expect(preferOnPushRule.name).toBe(
      'prefer-on-push-component-change-detection'
    );
    expect(preferOnPushRule.streamType).toBe('AngularClass');
  });

  it('flags a component without changeDetection specified', () => {
    const ctx = makeContext('', '/src/onpush-flag-a.component.ts');
    const fakeNode = {
      metadata: {
        type: 'Component',
        changeDetection: { kind: 'missing' },
        className: 'AppComponent',
        decoratorStart: 0,
      },
    };
    const result = preferOnPushRule.handle(fakeNode as any, ctx) as any;
    expect(result).not.toBeNull();
    expect(result.ruleName).toBe('prefer-on-push-component-change-detection');
    expect(result.severity).toBe('error');
    expect(result.message).toContain('AppComponent');
  });

  it('flags a component with ChangeDetectionStrategy.Default', () => {
    const ctx = makeContext('', '/src/onpush-default-b.component.ts');
    const fakeNode = {
      metadata: {
        type: 'Component',

        changeDetection: { kind: 'literal', value: 0 },
        className: 'DefaultComponent',
        decoratorStart: 0,
      },
    };
    const result = preferOnPushRule.handle(fakeNode as any, ctx) as any;
    expect(result).not.toBeNull();
    expect(result.message).toContain('DefaultComponent');
  });

  it('does NOT flag a component with ChangeDetectionStrategy.OnPush', () => {
    const ctx = makeContext('', '/src/onpush-ok-c.component.ts');
    const fakeNode = {
      metadata: {
        type: 'Component',

        changeDetection: { kind: 'literal', value: 1 },
        className: 'OnPushComponent',
        decoratorStart: 0,
      },
    };
    const result = preferOnPushRule.handle(fakeNode as any, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag when changeDetection is a non-literal expression', () => {
    const ctx = makeContext('', '/src/onpush-nonlit-d.component.ts');
    const fakeNode = {
      metadata: {
        type: 'Component',
        changeDetection: { kind: 'non-literal' },
        className: 'DynamicComponent',
        decoratorStart: 0,
      },
    };
    const result = preferOnPushRule.handle(fakeNode as any, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag a Directive (metadata.type !== Component)', () => {
    const ctx = makeContext('', '/src/onpush-dir-e.directive.ts');
    const fakeNode = {
      metadata: {
        type: 'Directive',
        changeDetection: { kind: 'missing' },
        className: 'SomeDirective',
        decoratorStart: 0,
      },
    };
    const result = preferOnPushRule.handle(fakeNode as any, ctx);
    expect(result).toBeNull();
  });
});

describe('template-no-call-expression', () => {
  it('has correct name and streamType', () => {
    expect(templateNoCallExpressionRule.name).toBe(
      'template-no-call-expression'
    );
    expect(templateNoCallExpressionRule.streamType).toBe('TemplateExpression');
  });

  it('flags a call expression with arguments', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'formatDate' },
        arguments: [{ type: 'Identifier', name: 'date' }],
      },
      sourceSpan: { start: 0, end: 20 },
    } as any;
    const result = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures[0].ruleName).toBe('template-no-call-expression');
  });

  it('does NOT flag an allowlisted method call (slice)', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: {
          type: 'StaticMemberExpression',
          object: { type: 'Identifier', name: 'items' },
          property: { type: 'Identifier', name: 'slice' },
        },
        arguments: [{ type: 'Literal', value: 0 }],
      },
      sourceSpan: { start: 0, end: 20 },
    } as any;
    const result = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag $any() Angular built-in cast', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '$any' },
        arguments: [{ type: 'Identifier', name: 'value' }],
      },
      sourceSpan: { start: 0, end: 15 },
    } as any;
    const result = templateNoCallExpressionRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });
});

describe('template-no-array-literal-binding', () => {
  it('has correct name and streamType', () => {
    expect(templateNoArrayLiteralBindingRule.name).toBe(
      'template-no-array-literal-binding'
    );
    expect(templateNoArrayLiteralBindingRule.streamType).toBe(
      'TemplateExpression'
    );
  });

  it('flags an array literal in a template expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'ArrayExpression',
        elements: [
          { type: 'Literal', value: 1 },
          { type: 'Literal', value: 2 },
        ],
      },
      sourceSpan: { start: 0, end: 10 },
    } as any;
    const result = templateNoArrayLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures[0].ruleName).toBe('template-no-array-literal-binding');
    expect(failures[0].severity).toBe('warn');
  });

  it('flags a nested array literal inside a call expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'fn' },
        arguments: [{ type: 'ArrayExpression', elements: [] }],
      },
      sourceSpan: { start: 0, end: 20 },
    } as any;
    const result = templateNoArrayLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
  });

  it('does NOT flag a plain identifier expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: { type: 'Identifier', name: 'myArray' },
      sourceSpan: { start: 0, end: 10 },
    } as any;
    const result = templateNoArrayLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag an object literal (different rule)', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: { type: 'ObjectExpression', properties: [] },
      sourceSpan: { start: 0, end: 10 },
    } as any;
    const result = templateNoArrayLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });
});

describe('template-no-object-literal-binding', () => {
  it('has correct name and streamType', () => {
    expect(templateNoObjectLiteralBindingRule.name).toBe(
      'template-no-object-literal-binding'
    );
    expect(templateNoObjectLiteralBindingRule.streamType).toBe(
      'TemplateExpression'
    );
  });

  it('flags an object literal in a template expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'ObjectExpression',
        properties: [
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'color' },
            value: { type: 'Literal', value: 'red' },
          },
        ],
      },
      sourceSpan: { start: 0, end: 20 },
    } as any;
    const result = templateNoObjectLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures[0].ruleName).toBe('template-no-object-literal-binding');
    expect(failures[0].severity).toBe('warn');
  });

  it('flags a nested object literal inside a conditional expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: {
        type: 'ConditionalExpression',
        test: { type: 'Identifier', name: 'cond' },
        consequent: { type: 'ObjectExpression', properties: [] },
        alternate: { type: 'Identifier', name: 'defaultStyles' },
      },
      sourceSpan: { start: 0, end: 30 },
    } as any;
    const result = templateNoObjectLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).not.toBeNull();
  });

  it('does NOT flag a plain identifier expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: { type: 'Identifier', name: 'styles' },
      sourceSpan: { start: 0, end: 8 },
    } as any;
    const result = templateNoObjectLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag an array literal (separate rule handles that)', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeNode = {
      expression: { type: 'ArrayExpression', elements: [] },
      sourceSpan: { start: 0, end: 5 },
    } as any;
    const result = templateNoObjectLiteralBindingRule.handle(fakeNode, ctx);
    expect(result).toBeNull();
  });
});

describe('template-trackby-required', () => {
  it('has correct name and streamType', () => {
    expect(templateTrackByRequiredRule.name).toBe('template-trackby-required');
    expect(templateTrackByRequiredRule.streamType).toBe('Template');
  });

  it('flags *ngFor without trackBy', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeAnalysis = {
      attributes: [
        {
          name: '*ngFor',
          value: 'let item of items',
          sourceSpan: { start: 0, end: 25 },
        },
      ],
      blocks: [],
    } as any;
    const result = templateTrackByRequiredRule.handle(fakeAnalysis, ctx);
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures[0].ruleName).toBe('template-trackby-required');
    expect(failures[0].severity).toBe('error');
  });

  it('does NOT flag *ngFor with trackBy specified', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeAnalysis = {
      attributes: [
        {
          name: '*ngFor',
          value: 'let item of items; trackBy: trackItem',
          sourceSpan: { start: 0, end: 45 },
        },
      ],
      blocks: [],
    } as any;
    const result = templateTrackByRequiredRule.handle(fakeAnalysis, ctx);
    expect(result).toBeNull();
  });

  it('flags @for block without track expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeAnalysis = {
      attributes: [],
      blocks: [
        {
          name: 'for',
          parameters: [{ expression: 'item of items' }],
          sourceSpan: { start: 0, end: 20 },
        },
      ],
    } as any;
    const result = templateTrackByRequiredRule.handle(fakeAnalysis, ctx);
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures[0].ruleName).toBe('template-trackby-required');
  });

  it('does NOT flag @for block with track expression', () => {
    const ctx = makeContext('', '/src/app.component.ts');

    const fakeAnalysis = {
      attributes: [],
      blocks: [
        {
          name: 'for',
          parameters: [
            { expression: 'item of items' },
            { expression: 'track item.id' },
          ],
          sourceSpan: { start: 0, end: 30 },
        },
      ],
    } as any;
    const result = templateTrackByRequiredRule.handle(fakeAnalysis, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag an @if block (not a loop)', () => {
    const ctx = makeContext('', '/src/app.component.ts');
    const fakeAnalysis = {
      attributes: [],
      blocks: [
        {
          name: 'if',
          parameters: [{ expression: 'isVisible' }],
          sourceSpan: { start: 0, end: 15 },
        },
      ],
    } as any;
    const result = templateTrackByRequiredRule.handle(fakeAnalysis, ctx);
    expect(result).toBeNull();
  });
});
