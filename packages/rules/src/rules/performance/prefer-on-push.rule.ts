import { ChangeDetectionStrategy, type AngularClassNode } from '@ngcompass/ast';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import { createComponentRule } from '@ngcompass/engine';
import { RuleContext, RuleFailure } from '@ngcompass/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

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

function getComponentName(classNode: AngularClassNode): string {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return metadata?.className ?? 'AnonymousComponent';
}

function isReportableChangeDetection(changeDetection: AnyNode): boolean {
    if (!changeDetection || typeof changeDetection !== 'object') return false;
    const kind = changeDetection.kind;
    if (kind === 'non-literal') return false;
    if (kind === 'literal') return changeDetection.value !== ChangeDetectionStrategy.OnPush;
    if (kind === 'missing') return true;
    return false;
}

/**
 * Enforces ChangeDetectionStrategy.OnPush for Angular components.
 */
export const preferOnPushRule = createComponentRule(
    'prefer-on-push-component-change-detection',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
        if (metadata.type !== 'Component') return null;

        const changeDetection = metadata.changeDetection;
        if (!isReportableChangeDetection(changeDetection)) return null;

        const offset = getSafeReportOffset(classNode);
        const { line, column } = context.locator.location(offset);
        const name = getComponentName(classNode);

        // CTX-008: Use ngModuleMap to find which NgModule declares this component.
        // When found, add module context to the message and report how many components
        // in the same module still need OnPush — turns a generic advisory into an
        // actionable, module-scoped finding.
        let moduleContext = '';
        if (context.project) {
            const { ngModuleMap, classToFile } = context.project;
            let declaringModuleFile: string | undefined;
            let componentPeersInModule = 0;

            for (const [moduleFile, moduleInfo] of ngModuleMap) {
                if (moduleInfo.isStandalone) continue;
                if (!moduleInfo.declarations.has(name)) continue;

                declaringModuleFile = moduleFile;

                // Count component peers in this module (to surface module-level coverage info).
                for (const declaredClass of moduleInfo.declarations) {
                    const declFile = classToFile.get(declaredClass);
                    if (declFile && declFile.endsWith('.component.ts')) componentPeersInModule++;
                }
                break;
            }

            if (declaringModuleFile) {
                // Derive a human-readable module name from the file path.
                // e.g. "/src/app/shared/shared.module.ts" → "shared.module"
                const segments = declaringModuleFile.replace(/\\/g, '/').split('/');
                const fileName = segments[segments.length - 1] ?? declaringModuleFile;
                const moduleName = fileName.replace(/\.ts$/, '');
                // peerCount excludes the current component itself
                const peerCount = Math.max(0, componentPeersInModule - 1);
                const peerNote = peerCount > 0
                    ? ` ${peerCount} other component${peerCount === 1 ? '' : 's'} in '${moduleName}' may also need OnPush.`
                    : '';
                moduleContext = ` (declared in '${moduleName}')${peerNote}`;
            }
        }

        return {
            filePath: context.filePath,
            ruleName: 'prefer-on-push-component-change-detection',
            message: `Component '${name}'${moduleContext} should use ChangeDetectionStrategy.OnPush.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['prefer-on-push-component-change-detection'],
            codeExample: CODE_EXAMPLES['prefer-on-push-component-change-detection'],
        };
    },
    { requires: { projectContext: true } }
);

