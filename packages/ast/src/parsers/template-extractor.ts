/**
 * Template Extractor
 *
 * Extracts the inline template string from an Oxc-parsed TypeScript program.
 * Moved from orchestrator.ts to make it independently testable and reusable.
 *
 * Uses walkProgram() (the shared visitor) instead of a hand-rolled recursion,
 * which is consistent with how the rules engine traverses the AST and
 * benefits from the same early-exit optimisation (returning false stops descent).
 *
 * Handles both:
 *  - StringLiteral:   template: '<h1>Hello</h1>'
 *  - TemplateLiteral: template: `<h1>{{ name }}</h1>`
 */

import { walkProgram } from '../visitor.js';
import type { Program } from 'oxc-parser';

// ============================================
// PUBLIC API
// ============================================

/**
 * Result of extracting an inline template from a TypeScript program.
 */
export interface ExtractedTemplate {
    /** The raw HTML content of the template (no surrounding quotes/backticks). */
    readonly content: string;
    /**
     * Byte offset in the TypeScript source file where `content[0]` lives.
     *
     * This is used to convert template-relative offsets (produced by the HTML
     * parser, which only sees the template content) back into file-absolute
     * offsets (required by `Locator.location()`).
     *
     * For external .html files this value is always 0 — the HTML file IS the
     * template, so its offsets are already file-absolute.
     */
    readonly startOffset: number;
}

/**
 * Extracts the inline template string from the first @Component class found
 * in the given Oxc program.
 *
 * @param program - Oxc-parsed Program node
 * @returns ExtractedTemplate with content and its start offset in the file,
 *          or `{ content: '', startOffset: 0 }` if no template was found.
 */
export function extractTemplateFromProgram(program: Program): ExtractedTemplate {
    let result: ExtractedTemplate = { content: '', startOffset: 0 };

    walkProgram(program, (node: any) => {
        // Once we have the template, stop walking (false = skip children)
        if (result.content) return false;

        if (node.type === 'ClassDeclaration' && Array.isArray(node.decorators)) {
            const extracted = tryExtractFromClass(node);
            if (extracted) {
                result = extracted;
                return false; // stop traversal
            }
        }
    });

    return result;
}

// ============================================
// PRIVATE HELPERS
// ============================================

/**
 * Attempts to extract the `template` property value from a class decorated
 * with @Component.
 */
function tryExtractFromClass(classNode: any): ExtractedTemplate | null {
    for (const decorator of classNode.decorators) {
        const call = decorator?.expression;
        if (!call || call.type !== 'CallExpression') continue;

        const callee = call.callee;
        if (!callee || callee.type !== 'Identifier' || callee.name !== 'Component') continue;

        const objectArg = call.arguments?.[0];
        if (!objectArg || objectArg.type !== 'ObjectExpression') continue;

        const templateValue = findPropertyValue(objectArg.properties, 'template');
        if (templateValue) {
            return extractStringValueWithOffset(templateValue);
        }
    }
    return null;
}

/**
 * Finds the value expression of a named property in an ObjectExpression.
 */
function findPropertyValue(properties: any[], keyName: string): any | null {
    if (!Array.isArray(properties)) return null;
    for (const prop of properties) {
        const key = prop?.key;
        const value = prop?.value;
        if (!key || !value) continue;
        const name = key?.name ?? key?.value;
        if (name === keyName) return value;
    }
    return null;
}

/**
 * Extracts a string value AND its start offset from a StringLiteral or
 * TemplateLiteral AST node.
 *
 * The startOffset is the position of the *first content character* in the
 * original TypeScript source file — i.e. the position right after the
 * opening quote or backtick.
 */
function extractStringValueWithOffset(node: any): ExtractedTemplate {
    if (!node) return { content: '', startOffset: 0 };

    if (node.type === 'StringLiteral') {
        // node.start / node.span.start → position of the opening quote in the file
        const nodeStart: number = node.start ?? node.span?.start ?? 0;
        return {
            content: node.value ?? '',
            startOffset: nodeStart + 1, // +1 to skip the opening ' or "
        };
    }

    if (node.type === 'TemplateLiteral') {
        const quasis: any[] = node.quasis ?? [];
        const content = quasis.map((q: any) => q.value?.raw ?? '').join('');
        // The first quasi's start position points to the opening backtick
        const firstStart: number = quasis[0]?.start ?? quasis[0]?.span?.start ?? 0;
        return {
            content,
            startOffset: firstStart + 1, // +1 to skip the opening `
        };
    }

    return { content: '', startOffset: 0 };
}
