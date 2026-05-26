import { parseSync } from 'oxc-parser';
import { debug } from '@ngcompass/common';
import type {
  TemplateAnalysis,
  TemplateAttributeNode,
  TemplateBlockNode,
  TemplateExpressionNode,
} from '../node-streams.js';
import type { HtmlParserResult } from '../parsers/html.js';

type HtmlAstNode = {
  children?: readonly HtmlAstNode[];
  attrs?: ReadonlyArray<{
    name: string;
    value: string;
    valueSpan?: { start?: { offset?: number } };
    sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
  }>;
  kind?: string;
  type?: string;
  constructor?: { name?: string };
  value?: string;
  tokens?: ReadonlyArray<{
    type: number;
    parts?: string[];
    sourceSpan: { start: { offset: number } };
  }>;
  name?: string;
  parameters?: ReadonlyArray<{
    expression?: string;
    sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
  }>;
  sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
};

const TOKEN_KIND_INTERPOLATION = 8;

const INTERPOLATION_PART_COUNT = 3;

const INTERPOLATION_OPEN_LEN = 2;

const FOR_OF = ' of ';
const FOR_TRACK = ' track ';

export const analyzeTemplate = (
  htmlResult: HtmlParserResult
): TemplateAnalysis => {
  const expressions: TemplateExpressionNode[] = [];
  const attributes: TemplateAttributeNode[] = [];
  const blocks: TemplateBlockNode[] = [];
  const offset = htmlResult.templateStartOffset;

  const visit = (node: HtmlAstNode | undefined | null): void => {
    if (!node) return;
    if (node.children) {
      for (const child of node.children) visit(child);
    }
    visitAttributes(node, attributes, expressions, offset);
    visitTextNode(node, expressions, offset);
    visitBlock(node, blocks, expressions, offset);
  };

  for (const rootNode of htmlResult.rootNodes) visit(rootNode as HtmlAstNode);

  return { expressions, attributes, blocks };
};

const visitAttributes = (
  node: HtmlAstNode,
  attributes: TemplateAttributeNode[],
  expressions: TemplateExpressionNode[],
  offset: number
): void => {
  if (!node.attrs) return;

  for (const attr of node.attrs) {
    const name = attr.name;
    const value = attr.value;
    const attrOffset = (attr.valueSpan?.start?.offset ?? 0) + offset;

    attributes.push({
      name,
      value,
      sourceSpan: {
        start: (attr.sourceSpan?.start?.offset ?? 0) + offset,
        end: (attr.sourceSpan?.end?.offset ?? 0) + offset,
      },
    });

    if (!value) continue;
    if (isBindingAttribute(name)) {
      parseAndAdd(value, attrOffset, expressions);
    }
  }
};

const visitTextNode = (
  node: HtmlAstNode,
  expressions: TemplateExpressionNode[],
  offset: number
): void => {
  const isText =
    node.kind === 'text' ||
    node.type === 'text' ||
    node.constructor?.name === 'Text';
  if (!isText || !node.value) return;

  if (node.tokens) {
    extractInterpolationsFromTokens(node, expressions, offset);
  } else {
    extractInterpolationsManually(node, expressions, offset);
  }
};

const visitBlock = (
  node: HtmlAstNode,
  blocks: TemplateBlockNode[],
  expressions: TemplateExpressionNode[],
  offset: number
): void => {
  if (node.kind !== 'block' && node.constructor?.name !== 'Block') return;

  const blockName = node.name ?? '';
  const parameters = node.parameters ?? [];

  blocks.push({
    name: blockName,
    parameters: parameters.map((p) => ({
      expression: p.expression ?? '',
      sourceSpan: {
        start: (p.sourceSpan?.start?.offset ?? 0) + offset,
        end: (p.sourceSpan?.end?.offset ?? 0) + offset,
      },
    })),
    sourceSpan: {
      start: (node.sourceSpan?.start?.offset ?? 0) + offset,
      end: (node.sourceSpan?.end?.offset ?? 0) + offset,
    },
  });

  for (const param of parameters) {
    if (!param.expression) continue;
    const paramOffset = (param.sourceSpan?.start?.offset ?? 0) + offset;
    if (blockName === 'for') {
      extractForBlockExpressions(param.expression, paramOffset, expressions);
    } else {
      parseAndAdd(param.expression, paramOffset, expressions);
    }
  }
};

const extractInterpolationsFromTokens = (
  node: HtmlAstNode,
  expressions: TemplateExpressionNode[],
  offset: number
): void => {
  if (!node.tokens) return;
  for (const token of node.tokens) {
    if (token.type !== TOKEN_KIND_INTERPOLATION) continue;
    if (token.parts?.length !== INTERPOLATION_PART_COUNT) continue;

    const expr = token.parts[1];
    const exprStart =
      token.sourceSpan.start.offset + token.parts[0].length + offset;
    parseAndAdd(expr, exprStart, expressions);
  }
};

const extractInterpolationsManually = (
  node: HtmlAstNode,
  expressions: TemplateExpressionNode[],
  offset: number
): void => {
  const textValue = node.value ?? '';
  const nodeStart = (node.sourceSpan?.start?.offset ?? 0) + offset;

  let cursor = 0;
  let start = textValue.indexOf('{{', cursor);
  while (start !== -1) {
    const end = textValue.indexOf('}}', start + INTERPOLATION_OPEN_LEN);
    if (end === -1) break;
    parseAndAdd(
      textValue.substring(start + INTERPOLATION_OPEN_LEN, end),
      nodeStart + start + INTERPOLATION_OPEN_LEN,
      expressions
    );
    cursor = end + INTERPOLATION_OPEN_LEN;
    start = textValue.indexOf('{{', cursor);
  }
};

const extractForBlockExpressions = (
  expression: string,
  offset: number,
  expressions: TemplateExpressionNode[]
): void => {
  if (expression.includes(FOR_TRACK)) {
    const trackPart = expression.split(FOR_TRACK)[1];
    const trackOffset =
      offset + expression.indexOf(FOR_TRACK) + FOR_TRACK.length;
    parseAndAdd(trackPart, trackOffset, expressions);
  } else if (expression.startsWith('track ')) {
    parseAndAdd(expression.substring(6), offset + 6, expressions);
  }

  if (expression.includes(FOR_OF)) {
    const collectionPart = expression.split(FOR_OF)[1].split(';')[0];
    const collectionOffset =
      offset + expression.indexOf(FOR_OF) + FOR_OF.length;
    parseAndAdd(collectionPart, collectionOffset, expressions);
  }
};

const isBindingAttribute = (name: string): boolean =>
  name.startsWith('*') ||
  (name.startsWith('[') && name.endsWith(']')) ||
  name.startsWith('bind-');

const parseAndAdd = (
  code: string,
  offset: number,
  outcomes: TemplateExpressionNode[]
): void => {
  if (!code.trim()) return;

  try {
    const ret = parseSync('template.ts', `(${code})`, {
      sourceType: 'module',
      lang: 'ts',
    });
    if (ret.program.body.length === 0) return;

    const stmt = ret.program.body[0];
    if (stmt.type !== 'ExpressionStatement' || !stmt.expression) return;

    let expr = stmt.expression as { type: string; expression?: unknown };
    if (expr.type === 'ParenthesizedExpression' && expr.expression) {
      expr = expr.expression as typeof expr;
    }

    outcomes.push({
      expression: expr,
      sourceSpan: { start: offset, end: offset + code.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debug(
      'parser',
      `Skipping unparsable template fragment "${code}": ${message}`
    );
  }
};
