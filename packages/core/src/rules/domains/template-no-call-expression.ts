
import { parseTs } from '../../parsers/ts.js';
import { RuleResult, RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';

/**
 * template-no-call-expression
 *
 * Detects function calls in templates (e.g. {{ getValue() }}).
 * Function calls in templates are executed on every change detection cycle.
 */
export const templateNoCallExpression = (context: RuleContext): RuleResult => {
    const { template, program } = context;
    const failures: RuleFailure[] = [];

    // Debug logs to confirm rule execution
    // console.log('[DEBUG] TemplateRule - Input Template:', template ? 'Present' : 'Missing');
    if (template && template.rootNodes) {
        // console.log('[DEBUG] TemplateRule - Root Nodes:', template.rootNodes.length);
    }

    if (!template || !template.rootNodes) {
        return { ruleName: 'template-no-call-expression', failures: [] };
    }

    const checkExpression = (expr: string, sourceSpan: any) => {
        if (!expr || !expr.trim()) return;

        try {
            // Parse expression as a dummy TS statement to leverage Oxc
            // Wrap in () to handle object literals or other expression types
            // Using a dummy filename to avoid cache collisions or issues
            const parserRes = parseTs(`(${expr})`, 'template-expr.tsx');
            const exprProgram = parserRes.program;

            // Check for CallExpression in the parsed AST
            walkProgram(exprProgram, (node) => {
                if (node.type === 'CallExpression') {
                    failures.push({
                        filePath: context.filePath,
                        message: `Avoid function calls in templates: ${expr}`,
                        line: (sourceSpan.start.line || 0) + 1,
                        column: (sourceSpan.start.col || 0) + 1,
                        severity: 'high',
                        ruleName: 'template-no-call-expression'
                    });
                    return false; // Stop visiting children of this call expression
                }
            });
        } catch (e) {
            // Ignore parse errors
        }
    };

    const visitHtml = (nodes: any[]) => {
        for (const node of nodes) {
            if (node.type === 'Element') {
                for (const attr of node.attrs) {
                    // Check Inputs: [prop]="expr" or bind-prop="expr"
                    if (attr.name.startsWith('[') || attr.name.startsWith('bind-')) {
                        checkExpression(attr.value, attr.sourceSpan);
                    }
                }
                visitHtml(node.children);
            } else if (node.type === 'Interpolation') {
                // Strip {{ and }}
                // node.value is " {{ foo() }} "
                const content = node.value.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
                checkExpression(content, node.sourceSpan);
            }
        }
    };

    visitHtml(template.rootNodes);

    return {
        ruleName: 'template-no-call-expression',
        failures
    };
};
