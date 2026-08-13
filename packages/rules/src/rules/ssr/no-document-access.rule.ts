import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from '../../recommendations';
import {
  childNodes,
  ensureRuleSourceFile,
  getClassBody,
  getNodeStart,
  isCalleeNamed,
  isDomLibSymbol,
  isMemberExpressionLike,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-document-access';

const CANDIDATE_NAMES = new Set([
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
]);

function detectGuardType(
  node: AstNode,
  browserGuardVars: Set<string>
): 'browser' | 'server' | null {
  const stack = [node];
  while (stack.length) {
    const n = unwrapNode(stack.pop());
    if (!n) continue;

    if (
      n.type === 'CallExpression' &&
      n.callee &&
      isCalleeNamed(n.callee, 'isPlatformBrowser')
    )
      return 'browser';
    if (
      n.type === 'CallExpression' &&
      n.callee &&
      isCalleeNamed(n.callee, 'isPlatformServer')
    )
      return 'server';

    if (n.type === 'UnaryExpression' && n.operator === '!' && n.argument) {
      const arg = unwrapNode(n.argument);
      if (
        arg?.type === 'CallExpression' &&
        arg.callee &&
        isCalleeNamed(arg.callee, 'isPlatformServer')
      )
        return 'browser';
    }

    if (n.type === 'Identifier' && browserGuardVars.has(n.name as string))
      return 'browser';

    for (const child of childNodes(n)) stack.push(child);
  }
  return null;
}

function collectBrowserGuardVars(classBody: AstNode[]): Set<string> {
  const vars = new Set<string>();
  const stack: AstNode[] = [...classBody];
  while (stack.length) {
    const n = unwrapNode(stack.pop());
    if (!n) continue;
    if (n.type === 'VariableDeclarator' && n.init) {
      const init = unwrapNode(n.init as AstNode);
      if (
        init?.type === 'CallExpression' &&
        init.callee &&
        isCalleeNamed(init.callee, 'isPlatformBrowser')
      ) {
        const id = (n.id as AstNode | undefined) ?? n.key;
        if (id?.type === 'Identifier' && id.name) vars.add(id.name);
      }
    }
    if (n.type === 'AssignmentExpression' && n.right) {
      const right = unwrapNode(n.right);
      if (
        right?.type === 'CallExpression' &&
        right.callee &&
        isCalleeNamed(right.callee, 'isPlatformBrowser')
      ) {
        const left = unwrapNode(n.left);
        if (
          left &&
          isMemberExpressionLike(left) &&
          unwrapNode(left.object)?.type === 'ThisExpression'
        ) {
          const prop = left.property?.name;
          if (typeof prop === 'string' && prop) vars.add(prop);
        }
      }
    }
    for (const child of childNodes(n)) stack.push(child);
  }
  return vars;
}

function getRootIdentifier(node: AstNode): AstNode | null {
  let curr: AstNode | null = node;
  while (curr && isMemberExpressionLike(curr)) curr = unwrapNode(curr.object);
  return curr?.type === 'Identifier' ? curr : null;
}

export const noDocumentAccessRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    streamNode: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const classBody = getClassBody(streamNode.node as unknown as AstNode);
    if (classBody.length === 0) return null;

    const { typeChecker } = context;
    if (!typeChecker) return null;

    const sourceFile = ensureRuleSourceFile(context);
    if (!sourceFile) return null;

    const browserGuardVars = collectBrowserGuardVars(classBody);
    const failures: RuleFailure[] = [];
    const reported = new Set<number>();
    const stack: AstNode[] = [...classBody];

    while (stack.length) {
      const n = unwrapNode(stack.pop());
      if (!n) continue;

      if (n.type === 'IfStatement' && n.test) {
        const test = unwrapNode(n.test);
        if (test) {
          const guardType = detectGuardType(test, browserGuardVars);
          if (guardType === 'browser') {
            if (n.alternate) stack.push(n.alternate);
            continue;
          }
          if (guardType === 'server') {
            if (n.consequent) stack.push(n.consequent);
            continue;
          }
        }
      }

      if (n.type === 'CallExpression' && n.callee) {
        const callee = unwrapNode(n.callee);
        if (
          callee &&
          (isCalleeNamed(callee, 'afterNextRender') ||
            isCalleeNamed(callee, 'afterRender'))
        ) {
          const args = n.arguments ?? [];
          for (let i = 1; i < args.length; i++) stack.push(args[i]);
          continue;
        }
      }

      if (isMemberExpressionLike(n)) {
        const root = getRootIdentifier(n);
        const rootName = root?.name as string | undefined;
        if (root && rootName && CANDIDATE_NAMES.has(rootName)) {
          if (resolvesToDomGlobal(root, sourceFile, typeChecker)) {
            const start = getNodeStart(root);
            if (start !== undefined && !reported.has(start)) {
              reported.add(start);
              const { line, column } = context.locator.location(start);
              failures.push({
                filePath: context.filePath,
                ruleName: RULE_NAME,
                message: `Direct access to \`${rootName}\` can run during SSR where browser globals do not exist.`,
                line,
                column,
                severity: 'error',
                fix: RECOMMENDATIONS[RULE_NAME],
                codeExample: CODE_EXAMPLES[RULE_NAME],
              });
            }
          }
        }
      }
      for (const child of childNodes(n)) stack.push(child);
    }
    return failures.length ? failures : null;
  },
  { requires: { typeChecker: true } }
);

function resolvesToDomGlobal(
  oxcId: AstNode,
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker
): boolean {
  const start = getNodeStart(oxcId);
  const tsNode = findTsIdentifierAtPosition(sourceFile, start);
  if (!tsNode) return false;
  const symbol = typeChecker.getSymbolAtLocation(tsNode);
  const resolved =
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? typeChecker.getAliasedSymbol(symbol)
      : symbol;
  return isDomLibSymbol(resolved ?? undefined);
}

function findTsIdentifierAtPosition(
  sourceFile: ts.SourceFile,
  position: number
): ts.Identifier | undefined {
  let result: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (result) return;
    if (ts.isIdentifier(node) && node.getStart() === position) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}
