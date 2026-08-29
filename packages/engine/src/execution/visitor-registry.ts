import type {
  RuleHandler,
  StreamFilter,
  StreamFilters,
  StreamType,
  VisitorEntry,
  VisitorMap,
} from '../models/index.js';

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

const toStreamFilter = (filter: unknown): StreamFilter => filter as StreamFilter;

export function buildVisitorMap(
  handlers: ReadonlyArray<RuleHandler<unknown>>,
  streamFilters: StreamFilters
): VisitorMap {
  const mutable = new Map<string, VisitorEntry[]>();

  for (const handler of handlers) {
    const nodeType = STREAM_TO_NODE_TYPE[handler.streamType];

    if (!nodeType || nodeType.startsWith('__')) continue;

    const filter = streamFilters[handler.streamType];
    if (!filter) continue;

    const entry: VisitorEntry = {
      ruleName: handler.name,
      filter: toStreamFilter(filter),
      handle: handler.handle.bind(handler),
    };

    const existing = mutable.get(nodeType);
    if (existing) {
      existing.push(entry);
    } else {
      mutable.set(nodeType, [entry]);
    }
  }

  return mutable;
}
