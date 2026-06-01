import type { RuleHandler, StreamType } from './rule-handler.js';
import type { RuleFailure, RuleContext } from '@ngcompass/common';

type StreamToNodeType = { [K in StreamType]: string };

export const STREAM_TO_NODE_TYPE: StreamToNodeType = {
  AngularClass: 'ClassDeclaration',
  AnyAngularClass: 'ClassDeclaration',
  DecoratedProperty: 'PropertyDefinition',
  TemplateExpression: '__template_expression__',
  TemplateAttribute: '__template_attribute__',
  TemplateBlock: '__template_block__',
  Template: '__template_analysis__',
  CallExpression: 'CallExpression',
  NewExpression: 'NewExpression',
  ImportDeclaration: 'ImportDeclaration',
};

export interface VisitorEntry {
  readonly ruleName: string;

  readonly filter: (rawNode: any) => unknown;

  readonly handle: (
    streamNode: any,
    ctx: RuleContext
  ) => RuleFailure | RuleFailure[] | null;
}

export type VisitorMap = ReadonlyMap<string, ReadonlyArray<VisitorEntry>>;

export function buildVisitorMap(
  handlers: ReadonlyArray<RuleHandler<any>>,
  streamFilters: Partial<Record<StreamType, (rawNode: any) => unknown>>
): VisitorMap {
  const mutable = new Map<string, VisitorEntry[]>();

  for (const handler of handlers) {
    const nodeType = STREAM_TO_NODE_TYPE[handler.streamType];

    if (!nodeType || nodeType.startsWith('__')) continue;

    const filter = streamFilters[handler.streamType];
    if (!filter) continue;

    const entry: VisitorEntry = {
      ruleName: handler.name,
      filter,
      handle: handler.handle.bind(handler),
    };

    const existing = mutable.get(nodeType);
    if (existing) {
      existing.push(entry);
    } else {
      mutable.set(nodeType, [entry]);
    }
  }

  return mutable as VisitorMap;
}
