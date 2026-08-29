import { RuleFailure, RuleContext } from '@ngcompass/common';
import { CallExpression } from '@ngcompass/ast';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from '../../recommendations';
import {
  findObservableSourceCall,
  getNodeStart,
  getStaticPropertyName,
  hasTeardownInReceiverChain,
  isAngularComponentOrDirectiveFile,
  isLikelyHttpObservable,
  isMemberExpressionLike,
  isSubscribeCall,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';
import { hasManualTeardownInNgOnDestroy } from './rxjs-require-take-until-destroyed.rule.js';

const manualTeardownCache = new Map<string, boolean>();
const CACHE_LIMIT = 500;

function hasManualTeardown(context: RuleContext): boolean {
  const cached = manualTeardownCache.get(context.filePath);
  if (cached !== undefined) return cached;

  const result = hasManualTeardownInNgOnDestroy(context);
  if (manualTeardownCache.size >= CACHE_LIMIT) manualTeardownCache.clear();
  manualTeardownCache.set(context.filePath, result);
  return result;
}

const RULE_NAME = 'rxjs-no-subscribe-in-component';

function isFireAndForget(node: AstNode): boolean {
  const callee = unwrapNode(node.callee);
  if (!callee || !isMemberExpressionLike(callee)) return false;

  const receiver = unwrapNode(callee.object);
  if (!receiver) return false;

  if (receiver.type === 'CallExpression') {
    const pipeCallee = unwrapNode(receiver.callee);
    if (
      isMemberExpressionLike(pipeCallee) &&
      getStaticPropertyName(pipeCallee) === 'pipe'
    ) {
      const args = Array.isArray(receiver.arguments) ? receiver.arguments : [];
      const hasSingleEmission = args.some((arg) => {
        const call = unwrapNode(arg);
        if (call?.type !== 'CallExpression') return false;
        const name = unwrapNode(call.callee)?.name;
        return name === 'take' || name === 'first';
      });
      if (hasSingleEmission) return true;
    }
  }

  return isLikelyHttpObservable(findObservableSourceCall(receiver));
}

function getFailureMessage(node: CallExpression, context: RuleContext): string {
  const generic =
    'Open-ended subscriptions in components can outlive the component and make state harder to track.';
  const templateRefs = context.crossRef?.templateReferences;
  if (!templateRefs) return generic;

  const callee = unwrapNode((node as unknown as AstNode).callee);
  const receiver = unwrapNode(callee?.object);
  const propName = receiver ? getStaticPropertyName(receiver) : null;
  if (!propName) return generic;

  const baseName = propName.endsWith('$') ? propName.slice(0, -1) : propName;
  if (templateRefs.has(propName) || templateRefs.has(baseName)) {
    return `'${propName}' is read by the template, so subscribing manually adds state and teardown work the template can own.`;
  }

  return generic;
}

export const rxjsNoSubscribeInComponentRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    if (!isAngularComponentOrDirectiveFile(context)) return null;

    const astNode = node as unknown as AstNode;
    if (!isSubscribeCall(astNode) || isFireAndForget(astNode)) return null;

    const callee = unwrapNode(astNode.callee);
    const receiver = unwrapNode(callee?.object);
    if (receiver && hasTeardownInReceiverChain(receiver)) return null;

    if (hasManualTeardown(context)) return null;

    const start = getNodeStart(astNode);
    const { line, column } = context.locator.location(start);

    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message: getFailureMessage(node, context),
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
      codeExample: CODE_EXAMPLES[RULE_NAME],
    };
  },
  { requires: { typeChecker: true, projectContext: true } }
);
