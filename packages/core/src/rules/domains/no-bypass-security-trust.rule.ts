/**
 * no-bypass-security-trust
 *
 * Disallows calls to Angular's DomSanitizer bypassSecurityTrust* methods.
 *
 * These methods explicitly disable Angular's XSS sanitisation for the supplied
 * value and mark it as safe. Their use should be extremely rare and always
 * code-reviewed. Widespread use is a sign of architectural issues, not a
 * legitimate security practice.
 *
 * Methods flagged:
 *   bypassSecurityTrustHtml
 *   bypassSecurityTrustStyle
 *   bypassSecurityTrustScript
 *   bypassSecurityTrustUrl
 *   bypassSecurityTrustResourceUrl
 *
 * Priority 1 — Security
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const BYPASS_METHODS = new Set([
    'bypassSecurityTrustHtml',
    'bypassSecurityTrustStyle',
    'bypassSecurityTrustScript',
    'bypassSecurityTrustUrl',
    'bypassSecurityTrustResourceUrl',
]);

export const noBypassSecurityTrustRule = createComponentRule(
    'no-bypass-security-trust',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        const failures: RuleFailure[] = [];

        walkProgram(classBody, (node) => {
            if (node.type !== 'CallExpression') return;

            const callee = node.callee;
            if (!callee) return;

            let methodName: string | undefined;

            // Direct call: bypassSecurityTrustHtml(...)
            if (callee.type === 'Identifier') {
                methodName = callee.name;
            }

            // Member call: this.sanitizer.bypassSecurityTrustHtml(...)
            if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
                const prop = callee.property;
                if (prop?.type === 'Identifier') {
                    methodName = prop.name;
                }
            }

            if (!methodName || !BYPASS_METHODS.has(methodName)) return;

            const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Avoid '${methodName}()' — it disables Angular's XSS protection. Justify and document any legitimate use.`,
                line,
                column,
                severity: 'high',
                ruleName: 'no-bypass-security-trust',
                fix: RECOMMENDATIONS['no-bypass-security-trust'],
            });
        });

        return failures.length > 0 ? failures : null;
    }
);
