import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from '../../recommendations';
import {
  childNodes,
  getClassBody,
  getConstructorMember,
  getMethodBody,
  getNodeStart,
  getStaticPropertyName,
  getTsSymbolAtNode,
  isMemberExpressionLike,
  isMethodDefinition,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode, MaybeAstNode } from '../../models/index.js';

const RULE_NAME = 'rxjs-avoid-subject-as-event-bus';

export const rxjsAvoidSubjectRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    streamNode: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    if (
      streamNode.decoratorName !== 'Component' &&
      streamNode.decoratorName !== 'Directive'
    ) {
      return null;
    }

    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const classBody = getClassBody(streamNode.node as unknown as AstNode);
    if (classBody.length === 0) return null;

    const teardownSubjects = collectTeardownSubjects(classBody);
    const bridgeSubjects = collectBridgeSubjects(classBody);
    const closingSubjects = collectClosingSubjects(classBody);
    const pipedSubjects = collectPipedSubjects(classBody);

    const failures: RuleFailure[] = [];

    for (const member of classBody) {
      if (
        member.type !== 'PropertyDefinition' ||
        member.accessibility === 'public'
      )
        continue;

      const name = (member.key?.name as string | undefined) ?? '';
      if (!name) continue;
      if (
        teardownSubjects.has(name) ||
        bridgeSubjects.has(name) ||
        closingSubjects.has(name) ||
        pipedSubjects.has(name)
      ) {
        continue;
      }

      const symbol = getTsSymbolAtNode(member.key as AstNode, context);
      if (!symbol) continue;
      const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!decl) continue;
      const type = typeChecker.getTypeOfSymbolAtLocation(symbol, decl);
      if (!angularTypes.isSubjectLike(type)) continue;

      const { line, column } = context.locator.location(getNodeStart(member));
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `'${name}' is a Subject the class signals into without piping or external exposure — components are easier to follow when local state lives in fields or signals.`,
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
      });
    }
    return failures.length > 0 ? failures : null;
  }
);

function walkCalls(
  root: AstNode | null | undefined,
  onCall: (call: AstNode) => void
): void {
  if (!root) return;
  const stack: AstNode[] = [root];
  while (stack.length) {
    const node = unwrapNode(stack.pop());
    if (!node) continue;
    if (node.type === 'CallExpression') onCall(node);
    for (const child of childNodes(node)) stack.push(child);
  }
}

function thisPropertyName(node: MaybeAstNode): string | null {
  const member = unwrapNode(node);
  if (!member || !isMemberExpressionLike(member)) return null;
  const receiver = unwrapNode(member.object);
  const propertyName = getStaticPropertyName(member);
  if (!propertyName) return null;
  return receiver?.type === 'ThisExpression' ? propertyName : null;
}

function thisReceiverNameOfMethodCall(
  call: AstNode,
  method: string
): string | null {
  const callee = unwrapNode(call.callee);
  if (!callee || !isMemberExpressionLike(callee)) return null;
  if (getStaticPropertyName(callee) !== method) return null;
  return thisPropertyName(callee.object);
}

function collectTeardownSubjects(classBody: AstNode[]): Set<string> {
  const names = new Set<string>();
  for (const member of classBody) {
    const root = isMethodDefinition(member)
      ? getMethodBody(member)
      : member.type === 'PropertyDefinition'
        ? (member.value as AstNode | undefined)
        : undefined;
    walkCalls(root ?? null, (call) => {
      const callee = unwrapNode(call.callee);
      if (!callee) return;

      const name =
        callee.type === 'Identifier'
          ? (callee.name as string)
          : isMemberExpressionLike(callee)
            ? getStaticPropertyName(callee)
            : '';
      if (name !== 'takeUntil') return;

      const args = Array.isArray(call.arguments) ? call.arguments : [];
      for (const arg of args) {
        const subjectName = thisPropertyName(arg);
        if (subjectName) names.add(subjectName);
      }
    });
  }
  return names;
}

function collectClosingSubjects(classBody: AstNode[]): Set<string> {
  const names = new Set<string>();
  for (const member of classBody) {
    if (!isMethodDefinition(member)) continue;
    if (member.key?.name !== 'ngOnDestroy') continue;
    walkCalls(getMethodBody(member), (call) => {
      const subject = thisReceiverNameOfMethodCall(call, 'complete');
      if (subject) names.add(subject);
    });
  }
  return names;
}

function collectBridgeSubjects(classBody: AstNode[]): Set<string> {
  const names = new Set<string>();

  const collectFrom = (root: AstNode | null | undefined): void => {
    walkCalls(root ?? null, (call) => {
      const subject = thisReceiverNameOfMethodCall(call, 'next');
      if (subject) names.add(subject);
    });
  };

  const ctor = getConstructorMember(classBody);
  if (ctor) collectFrom(getMethodBody(ctor));

  for (const member of classBody) {
    if (isMethodDefinition(member)) {
      const keyName = member.key?.name;
      if (member.kind === 'set' && hasInputDecorator(member)) {
        collectFrom(member);
      }
      if (keyName === 'ngOnChanges') collectFrom(getMethodBody(member));
    } else if (member.type === 'PropertyDefinition' && member.value) {
      collectFrom(member.value as AstNode);
    }
  }
  return names;
}

function collectPipedSubjects(classBody: AstNode[]): Set<string> {
  const names = new Set<string>();
  for (const member of classBody) {
    const root = isMethodDefinition(member)
      ? getMethodBody(member)
      : member.type === 'PropertyDefinition'
        ? (member.value as AstNode | undefined)
        : undefined;
    walkCalls(root ?? null, (call) => {
      const subject = thisReceiverNameOfMethodCall(call, 'pipe');
      if (subject) names.add(subject);
    });
  }
  return names;
}

function hasInputDecorator(member: AstNode): boolean {
  const decorators = member.decorators;
  if (!Array.isArray(decorators)) return false;
  for (const dec of decorators) {
    const expr = unwrapNode(dec.expression);
    if (expr?.name === 'Input') return true;
    const callee = unwrapNode(expr?.callee);
    if (callee?.name === 'Input') return true;
  }
  return false;
}
