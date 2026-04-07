import { ChangeDetectionStrategy, type AngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createComponentRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

type AnyNode = any;

const RULE_NAME = 'prefer-on-push-component-change-detection';

type DeclaringModuleContext = {
    moduleName: string;
    siblingComponentCount: number;
};

function getSafeReportOffset(classNode: AngularClassNode): number {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return metadata?.decoratorStart ?? metadata?.start ?? (classNode as AnyNode)?.node?.start ?? (classNode as AnyNode)?.start ?? 0;
}

function getComponentName(classNode: AngularClassNode): string {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return metadata?.className ?? 'AnonymousComponent';
}

function isReportableChangeDetection(changeDetection: AnyNode): boolean {
    if (!changeDetection || typeof changeDetection !== 'object') return false;

    const { kind, value } = changeDetection;

    if (kind === 'non-literal') return false;
    if (kind === 'literal') return value !== ChangeDetectionStrategy.OnPush;
    if (kind === 'missing') return true;

    return false;
}

function normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function isLikelyComponentFile(filePath: string | undefined): boolean {
    return !!filePath && normalizeFilePath(filePath).endsWith('.component.ts');
}

function getModuleNameFromFilePath(moduleFilePath: string): string {
    const normalized = normalizeFilePath(moduleFilePath);
    const fileName = normalized.split('/').pop() ?? moduleFilePath;
    return fileName.replace(/\.ts$/, '');
}

function getDeclaringModuleContext(classNode: AngularClassNode, context: RuleContext): DeclaringModuleContext | null {
    if (!context.project) return null;

    const componentName = (classNode as AnyNode)?.metadata?.className;
    if (!componentName) return null;

    const currentFilePath = normalizeFilePath(context.filePath);
    const { ngModuleMap, classToFile } = context.project;

    for (const [moduleFile, moduleInfo] of ngModuleMap) {
        if (moduleInfo.isStandalone || !moduleInfo.declarations.has(componentName)) continue;

        const declaredFile = classToFile.get(componentName);
        if (declaredFile && normalizeFilePath(declaredFile) !== currentFilePath) continue;

        let siblingComponentCount = 0;
        for (const declaredClass of moduleInfo.declarations) {
            if (declaredClass === componentName) continue;
            if (isLikelyComponentFile(classToFile.get(declaredClass))) {
                siblingComponentCount++;
            }
        }

        return {
            moduleName: getModuleNameFromFilePath(moduleFile),
            siblingComponentCount,
        };
    }

    return null;
}

function buildFailureMessage(componentName: string, moduleContext: DeclaringModuleContext | null): string {
    if (!moduleContext) {
        return `Component '${componentName}' should use ChangeDetectionStrategy.OnPush.`;
    }

    const { moduleName, siblingComponentCount } = moduleContext;
    const siblingNote = siblingComponentCount > 0
        ? ` ${siblingComponentCount} other component${siblingComponentCount === 1 ? '' : 's'} are declared in '${moduleName}'.`
        : '';

    return `Component '${componentName}' (declared in '${moduleName}') should use ChangeDetectionStrategy.OnPush.${siblingNote}`;
}

function createFailure(classNode: AngularClassNode, context: RuleContext): RuleFailure {
    const offset = getSafeReportOffset(classNode);
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
        const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};

        if (metadata.type !== 'Component' || !isReportableChangeDetection(metadata.changeDetection)) {
            return null;
        }

        return createFailure(classNode, context);
    },
    { requires: { projectContext: true } }
);