import { TemplateAttributeNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createTemplateAttributeRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { getTemplateAbsoluteOffset } from "../../rule-utils";

const UNSAFE = new Map<string, { desc: string; severity: 'error' | 'warn' }>([
    ['[innerHTML]', { desc: 'innerHTML directly renders HTML markup and can execute injected scripts', severity: 'error' }],
    ['[outerHTML]', { desc: 'outerHTML replaces the element with raw HTML and is susceptible to XSS', severity: 'error' }],
    ['[srcdoc]', { desc: 'srcdoc embeds raw HTML inside an iframe and can execute injected scripts', severity: 'error' }],
    ['[style]', { desc: 'binding complex expressions to [style] can enable CSS injection', severity: 'warn' }],
]);

const KNOWN_SAFE_PIPES = /\|\s*(safeHtml|safeStyle|safeUrl|safeResourceUrl|sanitize|sanitizeHtml|sanitizeUrl|trustHtml|trustStyle|trustUrl|trustResourceUrl|bypassSecurity)\b/i;
const SANITIZE_METHOD_CALL = /\b(getSafeHtml|getSafeUrl|getSafeStyle|getSafeResourceUrl|sanitize|sanitizeHtml|sanitizeUrl|trustHtml|bypassSecurity)\s*\(/i;

function isSanitized(value: string): boolean {
    return KNOWN_SAFE_PIPES.test(value) || SANITIZE_METHOD_CALL.test(value);
}

export const templateNoUnsafeBindingsRule = createTemplateAttributeRule(
    'template-no-unsafe-bindings',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const entry = UNSAFE.get(node.name);
        if (!entry) return null;

        const value = node.value ?? '';
        if (isSanitized(value)) return null;

        // For [style], only flag complex expressions (method calls, pipes, ternary, etc.)
        if (node.name === '[style]' && !/[.(|?]/.test(value)) return null;

        const { line, column } = context.locator.location(getTemplateAbsoluteOffset(context, node.sourceSpan.start));
        return {
            filePath: context.filePath,
            ruleName: 'template-no-unsafe-bindings',
            message: `\`${node.name}\` binds raw content: ${entry.desc}. Unsanitized values can create injection risk.`,
            line,
            column,
            severity: entry.severity,
            fix: RECOMMENDATIONS['template-no-unsafe-bindings'],
        };
    },
    { requires: { htmlAst: true } }
);
