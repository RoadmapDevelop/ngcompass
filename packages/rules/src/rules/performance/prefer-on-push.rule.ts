import { ChangeDetectionStrategy, type AngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createComponentRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

type LoosePropertyBag = Record<string, unknown>;

const RULE_NAME = 'prefer-on-push-component-change-detection';

type DeclaringModuleContext = {
    moduleName: string;
    siblingComponentCount: number;
};

function getNumberProp(obj: LoosePropertyBag | undefined, key: string): number | undefined {
    const value = obj?.[key];
    return typeof value === 'number' ? value : undefined;
}

function getSafeReportOffset(classNode: AngularClassNode): number {
    const wrapper = classNode as unknown as LoosePropertyBag;
    const metadata = (wrapper.metadata as LoosePropertyBag | undefined) ?? {};
    const node = wrapper.node as LoosePropertyBag | undefined;

    return getNumberProp(metadata, 'decoratorStart')
        ?? getNumberProp(metadata, 'start')
        ?? getNumberProp(node, 'start')
        ?? getNumberProp(wrapper, 'start')
        ?? 0;
}

function getComponentName(classNode: AngularClassNode): string {
    const metadata = (classNode as unknown as LoosePropertyBag).metadata as LoosePropertyBag | undefined;
    const className = metadata?.className;
    return typeof className === 'string' ? className : 'AnonymousComponent';
}

function isReportableChangeDetection(changeDetection: unknown): boolean {
    if (!changeDetection || typeof changeDetection !== 'object') return false;

    const { kind, value } = changeDetection as { kind?: unknown; value?: unknown };

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

    const metadata = (classNode as unknown as LoosePropertyBag).metadata as LoosePropertyBag | undefined;
    const componentName = metadata?.className;
    if (typeof componentName !== 'string' || !componentName) return null;

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
        return `Component '${componentName}' uses default change detection, which can re-render more often than needed.`;
    }

    const { moduleName, siblingComponentCount } = moduleContext;
    const siblingNote = siblingComponentCount > 0
        ? ` ${siblingComponentCount} other component${siblingComponentCount === 1 ? '' : 's'} are declared in '${moduleName}'.`
        : '';

    return `Component '${componentName}' uses default change detection, which can re-render more often than needed.${siblingNote}`;
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
        const metadata = ((classNode as unknown as LoosePropertyBag).metadata as LoosePropertyBag | undefined) ?? {};

        if (metadata.type !== 'Component' || !isReportableChangeDetection(metadata.changeDetection)) {
            return null;
        }

        return createFailure(classNode, context);
    },
    { requires: { projectContext: true } }
);
