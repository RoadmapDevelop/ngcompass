import { describe, it, expect, vi } from 'vitest';
import {
  buildVisitorMap,
  STREAM_TO_NODE_TYPE,
} from '../src/visitor-registry.js';
import type { StreamType } from '../src/rule-handler.js';
import type { RuleHandler } from '../src/rule-handler.js';
import type { RuleFailure, RuleContext } from '../src/types.js';

function makeHandler(name: string, streamType: StreamType): RuleHandler<any> {
  return {
    name,
    streamType,
    handle: vi.fn().mockReturnValue(null),
  };
}

const identityFilter = (node: any) => node;

const nullFilter = () => null;

describe('STREAM_TO_NODE_TYPE', () => {
  const allStreamTypes: StreamType[] = [
    'AngularClass',
    'AnyAngularClass',
    'DecoratedProperty',
    'TemplateExpression',
    'TemplateAttribute',
    'CallExpression',
    'NewExpression',
  ];

  it('has an entry for every StreamType', () => {
    for (const st of allStreamTypes) {
      expect(STREAM_TO_NODE_TYPE).toHaveProperty(st);
    }
  });

  it('maps non-template streams to non-sentinel strings', () => {
    const nonTemplate: StreamType[] = [
      'AngularClass',
      'AnyAngularClass',
      'DecoratedProperty',
      'CallExpression',
      'NewExpression',
    ];
    for (const st of nonTemplate) {
      expect(STREAM_TO_NODE_TYPE[st]).not.toMatch(/^__/);
    }
  });

  it('maps template streams to sentinel strings starting with "__"', () => {
    expect(STREAM_TO_NODE_TYPE['TemplateExpression']).toMatch(/^__/);
    expect(STREAM_TO_NODE_TYPE['TemplateAttribute']).toMatch(/^__/);
  });

  it('maps AngularClass to ClassDeclaration', () => {
    expect(STREAM_TO_NODE_TYPE['AngularClass']).toBe('ClassDeclaration');
  });

  it('maps CallExpression to CallExpression', () => {
    expect(STREAM_TO_NODE_TYPE['CallExpression']).toBe('CallExpression');
  });

  it('maps NewExpression to NewExpression', () => {
    expect(STREAM_TO_NODE_TYPE['NewExpression']).toBe('NewExpression');
  });

  it('maps DecoratedProperty to PropertyDefinition', () => {
    expect(STREAM_TO_NODE_TYPE['DecoratedProperty']).toBe('PropertyDefinition');
  });
});

describe('buildVisitorMap', () => {
  it('returns an empty map when no handlers are provided', () => {
    const map = buildVisitorMap([], {});
    expect(map.size).toBe(0);
  });

  it('excludes template-stream handlers (sentinel prefix "__")', () => {
    const handlers = [
      makeHandler('tmpl-expr', 'TemplateExpression'),
      makeHandler('tmpl-attr', 'TemplateAttribute'),
    ];
    const map = buildVisitorMap(handlers, {
      TemplateExpression: identityFilter,
      TemplateAttribute: identityFilter,
    });

    expect(map.size).toBe(0);
  });

  it('excludes handlers whose stream has no registered filter', () => {
    const handlers = [makeHandler('rule-a', 'CallExpression')];

    const map = buildVisitorMap(handlers, {});
    expect(map.size).toBe(0);
  });

  it('includes a handler when a matching filter exists', () => {
    const handlers = [makeHandler('rule-call', 'CallExpression')];
    const map = buildVisitorMap(handlers, {
      CallExpression: identityFilter,
    });
    expect(map.has('CallExpression')).toBe(true);
    expect(map.get('CallExpression')).toHaveLength(1);
  });

  it('groups multiple handlers for the same stream under one nodeType key', () => {
    const handlers = [
      makeHandler('rule-a', 'CallExpression'),
      makeHandler('rule-b', 'CallExpression'),
      makeHandler('rule-c', 'CallExpression'),
    ];
    const map = buildVisitorMap(handlers, { CallExpression: identityFilter });
    expect(map.get('CallExpression')).toHaveLength(3);
  });

  it('separates handlers for different stream types into different keys', () => {
    const handlers = [
      makeHandler('rule-call', 'CallExpression'),
      makeHandler('rule-new', 'NewExpression'),
    ];
    const map = buildVisitorMap(handlers, {
      CallExpression: identityFilter,
      NewExpression: identityFilter,
    });
    expect(map.has('CallExpression')).toBe(true);
    expect(map.has('NewExpression')).toBe(true);
    expect(map.get('CallExpression')).toHaveLength(1);
    expect(map.get('NewExpression')).toHaveLength(1);
  });

  it('stores the correct ruleName on each visitor entry', () => {
    const handlers = [makeHandler('my-rule', 'CallExpression')];
    const map = buildVisitorMap(handlers, { CallExpression: identityFilter });
    const entry = map.get('CallExpression')![0];
    expect(entry.ruleName).toBe('my-rule');
  });

  it('stores the provided filter function on the entry', () => {
    const myFilter = (n: any) => n;
    const handlers = [makeHandler('r', 'NewExpression')];
    const map = buildVisitorMap(handlers, { NewExpression: myFilter });
    const entry = map.get('NewExpression')![0];
    expect(entry.filter).toBe(myFilter);
  });

  it('stores a bound handle function on the entry', () => {
    const handler = makeHandler('r', 'CallExpression');
    const map = buildVisitorMap([handler], { CallExpression: identityFilter });
    const entry = map.get('CallExpression')![0];

    entry.handle({} as any, {} as RuleContext);
    expect(handler.handle).toHaveBeenCalled();
  });

  it('handles AngularClass and AnyAngularClass sharing ClassDeclaration key', () => {
    const handlers = [
      makeHandler('comp-rule', 'AngularClass'),
      makeHandler('any-class-rule', 'AnyAngularClass'),
    ];
    const map = buildVisitorMap(handlers, {
      AngularClass: identityFilter,
      AnyAngularClass: identityFilter,
    });

    expect(map.has('ClassDeclaration')).toBe(true);
    expect(map.get('ClassDeclaration')).toHaveLength(2);
  });

  it('returns a ReadonlyMap (its entries are immutable from the outside)', () => {
    const handlers = [makeHandler('r', 'CallExpression')];
    const map = buildVisitorMap(handlers, { CallExpression: identityFilter });

    const entries = map.get('CallExpression')!;
    const originalLength = entries.length;

    expect(originalLength).toBe(1);
  });
});
