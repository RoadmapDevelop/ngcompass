import { TemplateAttributeNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createTemplateAttributeRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { RuleContext } from "@ngcompass/common";

function getTemplateAbsoluteOffset(context: RuleContext, node: TemplateAttributeNode): number {
    const templateStartOffset = (context as any).template?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }
    return node.sourceSpan.start;
}

/**
 * Property bindings that inject raw HTML/script/URL into the DOM and can
 * lead to XSS if bound to unsanitized user input.
 */
const UNSAFE_BINDINGS = new Map<string, string>([
    ['[innerHTML]', 'innerHTML directly renders HTML markup and can execute injected scripts'],
    ['[outerHTML]', 'outerHTML replaces the element with raw HTML and is susceptible to XSS'],
    ['[srcdoc]', 'srcdoc embeds raw HTML inside an iframe and can execute injected scripts'],
]);

/**
 * Returns true when the binding value references a known sanitization pipe,
 * indicating the developer has already handled sanitization.
 * Accepted: `safeHtml`, `sanitize`, `bypassSecurityTrust*` (flagged separately by no-bypass-sanitization),
 * or any pipe named `safe*`.
 */
function valueUsesSanitizationPipe(value: string): boolean {
    return /\|\s*(safe\w*|sanitize\w*|trustAs\w*)/i.test(value);
}

/**
 * Flags [innerHTML], [outerHTML], and [srcdoc] bindings that bind to unsanitized values.
 * Angular does run its own HTML sanitizer for innerHTML, but it can be bypassed via
 * DomSanitizer.bypassSecurityTrustHtml — making the explicit binding a risk surface worth flagging.
 * Pair with no-bypass-sanitization for a complete security story.
 */
export const templateNoUnsafeBindingsRule = createTemplateAttributeRule(
    'template-no-unsafe-bindings',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const description = UNSAFE_BINDINGS.get(node.name);
        if (!description) return null;

        const value = node.value ?? '';
        if (valueUsesSanitizationPipe(value)) return null;

        const offset = getTemplateAbsoluteOffset(context, node);
        const { line, column } = context.locator.location(offset);

        return {
            filePath: context.filePath,
            ruleName: 'template-no-unsafe-bindings',
            message: `\`${node.name}\` is an unsafe binding: ${description}. Ensure the value is sanitized, or use Angular's SafeHtml pipe.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['template-no-unsafe-bindings'],
        };
    },
    {
        requires: { htmlAst: true },
    }
);
