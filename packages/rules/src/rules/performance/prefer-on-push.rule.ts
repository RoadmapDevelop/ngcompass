import {
  ChangeDetectionStrategy,
  type AngularClassNode,
  type MetadataValue,
} from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createComponentRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

const RULE_NAME = 'prefer-on-push-component-change-detection';

interface DeclaringModuleContext {
  readonly moduleName: string;
  readonly siblingDeclarationCount: number;
}

function getComponentName(classNode: AngularClassNode): string {
  return classNode.metadata.className ?? 'AnonymousComponent';
}

function isReportableChangeDetection(
  changeDetection: MetadataValue<ChangeDetectionStrategy>
): boolean {
  if (changeDetection.kind === 'non-literal') return false;
  if (changeDetection.kind === 'literal') {
    return changeDetection.value !== ChangeDetectionStrategy.OnPush;
  }
  return true;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getModuleNameFromFilePath(moduleFilePath: string): string {
  const normalized = normalizeFilePath(moduleFilePath);
  const fileName = normalized.split('/').pop() ?? moduleFilePath;
  return fileName.replace(/\.ts$/, '');
}

function getDeclaringModuleContext(
  classNode: AngularClassNode,
  context: RuleContext
): DeclaringModuleContext | null {
  if (!context.project) return null;

  const componentName = classNode.metadata.className;
  if (!componentName) return null;

  const currentFilePath = normalizeFilePath(context.filePath);
  const { ngModuleMap, classToFile } = context.project;

  for (const [moduleFile, moduleInfo] of ngModuleMap) {
    if (moduleInfo.isStandalone || !moduleInfo.declarations.has(componentName))
      continue;

    const declaredFile = classToFile.get(componentName);
    if (declaredFile && normalizeFilePath(declaredFile) !== currentFilePath)
      continue;

    return {
      moduleName: getModuleNameFromFilePath(moduleFile),
      siblingDeclarationCount: Math.max(0, moduleInfo.declarations.size - 1),
    };
  }

  return null;
}

function buildFailureMessage(
  componentName: string,
  moduleContext: DeclaringModuleContext | null
): string {
  const base = `Component '${componentName}' uses default change detection, which can re-render more often than needed.`;
  if (!moduleContext) return base;

  const { moduleName, siblingDeclarationCount } = moduleContext;
  if (siblingDeclarationCount === 0) {
    return `${base} It is declared in '${moduleName}'.`;
  }
  const plural = siblingDeclarationCount === 1 ? '' : 's';
  return `${base} It is declared in '${moduleName}' alongside ${siblingDeclarationCount} other declaration${plural}.`;
}

function createFailure(
  classNode: AngularClassNode,
  context: RuleContext
): RuleFailure {
  const offset = classNode.metadata.decoratorStart;
  const { line, column } = context.locator.location(offset);
  const componentName = getComponentName(classNode);
  const moduleContext = getDeclaringModuleContext(classNode, context);

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message: buildFailureMessage(componentName, moduleContext),
    line,
    column,
    severity: 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
    codeExample: CODE_EXAMPLES[RULE_NAME],
  };
}

export const preferOnPushRule = createComponentRule(
  RULE_NAME,
  (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
    const { metadata } = classNode;

    if (
      metadata.type !== 'Component' ||
      !isReportableChangeDetection(metadata.changeDetection)
    ) {
      return null;
    }

    return createFailure(classNode, context);
  },
  { requires: { projectContext: true } }
);
