import { ChangeDetectionStrategy, type AngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createComponentRule } from '@ngcompass/engine';

import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const RULE_NAME = 'prefer-on-push-component-change-detection';

type DeclaringModuleContext = {
    moduleName: string;
    siblingComponentCount: number;
};

/**
 * Returns the safest available offset for reporting.
 */
function getSafeReportOffset(classNode: AngularClassNode): number {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};

    return (
        metadata?.decoratorStart ??
        metadata?.start ??
        (classNode as AnyNode)?.node?.start ??
        (classNode as AnyNode)?.start ??
        0
    );
}

/**
 * Returns the component class name when available.
 */
function getComponentName(classNode: AngularClassNode): string {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return metadata?.className ?? 'AnonymousComponent';
}

/**
 * Returns true when the component should be reported.
 *
 * Report when:
 * - changeDetection is missing
 * - changeDetection is a literal and not OnPush
 *
 * Skip when:
 * - changeDetection is non-literal
 * - changeDetection already resolves to OnPush
 */
function isReportableChangeDetection(changeDetection: AnyNode): boolean {
    if (!changeDetection || typeof changeDetection !== 'object') {
        return false;
    }

    const kind = changeDetection.kind;

    if (kind === 'non-literal') {
        return false;
    }

    if (kind === 'literal') {
        return changeDetection.value !== ChangeDetectionStrategy.OnPush;
    }

    if (kind === 'missing') {
        return true;
    }

    return false;
}

/**
 * Normalizes a file path for stable comparisons.
 */
function normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Returns true when the declared file is likely a component file.
 *
 * This is intentionally heuristic and is only used for contextual messaging,
 * not for determining whether the current component violates the rule.
 */
function isLikelyComponentFile(filePath: string | undefined): boolean {
    return !!filePath && normalizeFilePath(filePath).endsWith('.component.ts');
}

/**
 * Derives a readable module name from a module file path.
 *
 * Example:
 * /src/app/shared/shared.module.ts -> shared.module
 */
function getModuleNameFromFilePath(moduleFilePath: string): string {
    const normalized = normalizeFilePath(moduleFilePath);
    const segments = normalized.split('/');
    const fileName = segments[segments.length - 1] ?? moduleFilePath;

    return fileName.replace(/\.ts$/, '');
}

/**
 * Resolves NgModule context for the current component, when available.
 *
 * Notes:
 * - This uses the project's declaration map for contextual enrichment only.
 * - Sibling component count is heuristic and reflects other `.component.ts`
 *   declarations in the same NgModule, not verified peer violations.
 */
function getDeclaringModuleContext(
    classNode: AngularClassNode,
    context: RuleContext,
): DeclaringModuleContext | null {
    if (!context.project) {
        return null;
    }

    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    const componentName = metadata?.className;
    if (!componentName) {
        return null;
    }

    const currentFilePath = normalizeFilePath(context.filePath);
    const { ngModuleMap, classToFile } = context.project;

    for (const [moduleFile, moduleInfo] of ngModuleMap) {
        if (moduleInfo.isStandalone) {
            continue;
        }

        if (!moduleInfo.declarations.has(componentName)) {
            continue;
        }

        const declaredFile = classToFile.get(componentName);
        if (declaredFile && normalizeFilePath(declaredFile) !== currentFilePath) {
            continue;
        }

        let siblingComponentCount = 0;

        for (const declaredClass of moduleInfo.declarations) {
            if (declaredClass === componentName) {
                continue;
            }

            const declarationFile = classToFile.get(declaredClass);
            if (isLikelyComponentFile(declarationFile)) {
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

/**
 * Builds the failure message with optional NgModule context.
 */
function buildFailureMessage(
    componentName: string,
    moduleContext: DeclaringModuleContext | null,
): string {
    if (!moduleContext) {
        return `Component '${componentName}' should use ChangeDetectionStrategy.OnPush.`;
    }

    const { moduleName, siblingComponentCount } = moduleContext;
    const siblingNote =
        siblingComponentCount > 0
            ? ` ${siblingComponentCount} other component${siblingComponentCount === 1 ? '' : 's'
            } are declared in '${moduleName}'.`
            : '';

    return `Component '${componentName}' (declared in '${moduleName}') should use ChangeDetectionStrategy.OnPush.${siblingNote}`;
}

/**
 * Creates a failure for a component that does not use OnPush.
 */
function createFailure(
    classNode: AngularClassNode,
    context: RuleContext,
): RuleFailure {
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

/**
 * Enforces ChangeDetectionStrategy.OnPush for Angular components.
 */
export const preferOnPushRule = createComponentRule(
    RULE_NAME,
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};

        if (metadata.type !== 'Component') {
            return null;
        }

        if (!isReportableChangeDetection(metadata.changeDetection)) {
            return null;
        }

        return createFailure(classNode, context);
    },
    { requires: { projectContext: true } },
);