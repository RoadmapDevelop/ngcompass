import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  unwrapNode,
  isMemberExpressionLike,
  getStaticPropertyName,
  getTemplateAbsoluteOffset,
} from '../../rule-utils';

const seenByTemplateKey = new WeakMap<RuleContext, Map<string, Set<string>>>();

function getTemplateKey(context: RuleContext): string {
  const template = (
    context as RuleContext & { template?: { templateStartOffset?: number } }
  ).template;
  const offset = template?.templateStartOffset;
  return `${context.filePath}@${typeof offset === 'number' && Number.isFinite(offset) ? offset : 0}`;
}

function findAsyncExpression(
  nodeRaw: AstNode | null | undefined
): AstNode | null {
  const node = unwrapNode(nodeRaw);
  if (!node) return null;
  if (node.type === 'BinaryExpression' && node.operator === '|') {
    const right = unwrapNode(node.right);
    if (right?.type === 'Identifier' && right.name === 'async')
      return unwrapNode(node.left);
    return findAsyncExpression(node.left);
  }
  return null;
}

function stringify(node: AstNode | null | undefined, depth = 0): string | null {
  if (!node || depth > 10) return null;

  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Literal') {
    const v = node.value;
    if (v === null) return 'null';
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      typeof v === 'bigint'
    )
      return String(v);
    return null;
  }

  if (node.type === 'CallExpression') {
    const callee = stringify(node.callee, depth + 1);
    const args = (Array.isArray(node.arguments) ? node.arguments : []).map(
      (a) => stringify(a, depth + 1) ?? '?'
    );
    return `${callee}(${args.join(',')})`;
  }

  if (isMemberExpressionLike(node)) {
    const obj = stringify(node.object, depth + 1);
    const prop = getStaticPropertyName(node);
    if (obj && prop) return `${obj}.${prop}`;
  }

  if (node.type === 'UnaryExpression')
    return `${node.operator}${stringify(node.argument, depth + 1)}`;
  if (node.type === 'ConditionalExpression')
    return `${stringify(node.test, depth + 1)}?${stringify(node.consequent, depth + 1)}:${stringify(node.alternate, depth + 1)}`;

  if (node.type === 'OptionalExpression' || node.type === 'ChainExpression') {
    return stringify(node.expression, depth + 1);
  }

  if (node.type === 'LogicalExpression') {
    const left = stringify(node.left, depth + 1);
    const right = stringify(node.right, depth + 1);
    if (left && right) return `${left}${node.operator}${right}`;
  }

  if (node.type === 'BinaryExpression' && node.operator !== '|') {
    const left = stringify(node.left, depth + 1);
    const right = stringify(node.right, depth + 1);
    if (left && right) return `${left}${node.operator}${right}`;
  }

  if (node.type === 'ArrayExpression') {
    const elements = (node.elements ?? []).map(
      (e) => stringify(e, depth + 1) ?? '?'
    );
    return `[${elements.join(',')}]`;
  }

  if (node.type === 'ObjectExpression') {
    const props = (node.properties ?? []).map((p) => {
      const key = p.key ? stringify(p.key, depth + 1) : '?';
      const val = p.value ? stringify(p.value as AstNode, depth + 1) : '?';
      return `${key}:${val}`;
    });
    return `{${props.join(',')}}`;
  }

  if (node.type === 'TemplateLiteral') return '`tmpl`';

  if (node.type === 'AssignmentExpression') {
    const left = stringify(node.left, depth + 1);
    const right = stringify(node.right, depth + 1);
    if (left && right) return `${left}${node.operator}${right}`;
  }

  return null;
}

export const templateNoAsyncPipeDuplicationRule = createTemplateExpressionRule(
  'template-no-async-pipe-duplication',
  (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
    const target = findAsyncExpression(node.expression as unknown as AstNode);
    const key = target ? stringify(target) : null;
    if (!key) return null;

    const templateKey = getTemplateKey(context);
    let state = seenByTemplateKey.get(context);
    if (!state) {
      state = new Map();
      seenByTemplateKey.set(context, state);
    }

    let seen = state.get(templateKey);
    if (!seen) {
      seen = new Set();
      state.set(templateKey, seen);
    }

    if (seen.has(key)) {
      const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
      const { line, column } = context.locator.location(offset);
      return {
        filePath: context.filePath,
        ruleName: 'template-no-async-pipe-duplication',
        message: `Duplicate async pipe subscriptions for "${key}" can create repeated work and inconsistent loading states.`,
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS['template-no-async-pipe-duplication'],
      };
    }

    seen.add(key);
    return null;
  },
  { requires: { htmlAst: true } }
);
