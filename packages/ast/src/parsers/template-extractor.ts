/**
 * @fileoverview
 * Inline-template extractor for Oxc-parsed TypeScript programs.
 *
 * Walks a program via the shared {@link walkProgram} visitor (same traversal
 * the rules engine uses) and returns the first `template: '...'` /
 * `template: \`...\`` value found on a class decorated with `@Component`.
 *
 * Reports the start offset of the template content in the *original* source
 * file — i.e. the position immediately after the opening quote/backtick.
 * That offset is what `parseHtml(content, offset)` and `analyzeTemplate`
 * use to translate template-relative spans back to file-absolute spans.
 *
 * Only `@Component` is inspected — `@Directive` doesn't carry an inline
 * `template`, so there is nothing to extract there.
 */

import type { Program } from 'oxc-parser';
import { walkProgram } from '../visitor.js';

/** Loose record shape used while traversing the Oxc AST. */
type AstNode = {
    type?: string;
    [key: string]: unknown;
};

/** Result of {@link extractTemplateFromProgram}. */
export interface ExtractedTemplate {
    /** Raw HTML content of the template (no surrounding quotes/backticks). */
    readonly content: string;
    /**
     * Byte offset in the TypeScript source file where `content[0]` lives —
     * the position right after the opening quote or backtick.
     *
     * For external `.html` files this is always `0`; that case is handled
     * by callers that bypass this extractor.
     */
    readonly startOffset: number;
}

const EMPTY: ExtractedTemplate = { content: '', startOffset: 0 };

/**
 * Extracts the inline template string from the first `@Component` class in
 * the supplied Oxc program. Returns `{ content: '', startOffset: 0 }` when
 * no inline template is found.
 *
 * @param program - Oxc-parsed Program node.
 * @returns The extracted template content and its start offset in the file.
 */
export function extractTemplateFromProgram(program: Program): ExtractedTemplate {
    let result: ExtractedTemplate = EMPTY;

    walkProgram(program, (rawNode) => {
        const node = rawNode as AstNode;

        // Stop walking once we have the template.
        if (result.content) return false;

        if (node.type !== 'ClassDeclaration' || !Array.isArray(node.decorators)) return;

        const extracted = tryExtractFromClass(node);
        if (extracted) {
            result = extracted;
            return false; // halt traversal
        }
    });

    return result;
}

// ── Private helpers ────────────────────────────────────────────────────────

/** Attempts to extract a `template` value from a class decorated `@Component`. */
function tryExtractFromClass(classNode: AstNode): ExtractedTemplate | null {
    const decorators = classNode.decorators as ReadonlyArray<AstNode> | undefined;
    if (!decorators) return null;

    for (const decorator of decorators) {
        const call = decorator?.expression as AstNode | undefined;
        if (!call || call.type !== 'CallExpression') continue;

        const callee = call.callee as AstNode | undefined;
        if (!callee || callee.type !== 'Identifier' || callee.name !== 'Component') continue;

        const args = call.arguments as ReadonlyArray<AstNode> | undefined;
        const objectArg = args?.[0];
        if (!objectArg || objectArg.type !== 'ObjectExpression') continue;

        const templateValue = findPropertyValue(
            objectArg.properties as ReadonlyArray<AstNode>,
            'template',
        );
        if (templateValue) return extractStringValueWithOffset(templateValue);
    }
    return null;
}

/** Finds the value expression of a named property in an `ObjectExpression`. */
function findPropertyValue(
    properties: ReadonlyArray<AstNode>,
    keyName: string,
): AstNode | null {
    if (!Array.isArray(properties)) return null;
    for (const prop of properties) {
        const key = prop?.key as AstNode | undefined;
        const value = prop?.value as AstNode | undefined;
        if (!key || !value) continue;
        const name = key.name ?? key.value;
        if (name === keyName) return value;
    }
    return null;
}

/**
 * Returns the textual value of a `StringLiteral` or `TemplateLiteral` along
 * with its post-quote start offset in the source file.
 */
function extractStringValueWithOffset(node: AstNode): ExtractedTemplate {
    if (!node) return EMPTY;

    if (node.type === 'StringLiteral' || node.type === 'Literal') {
        const span = node.span as { start?: number } | undefined;
        const nodeStart = (node.start as number | undefined) ?? span?.start ?? 0;
        return {
            content: (node.value as string | undefined) ?? '',
            startOffset: nodeStart + 1, // +1 skips the opening ' or "
        };
    }

    if (node.type === 'TemplateLiteral') {
        const quasis = (node.quasis as ReadonlyArray<AstNode> | undefined) ?? [];
        const content = quasis
            .map((q) => {
                const quasiValue = q.value as { raw?: string } | undefined;
                return quasiValue?.raw ?? '';
            })
            .join('');
        const firstSpan = quasis[0]?.span as { start?: number } | undefined;
        const firstStart =
            (quasis[0]?.start as number | undefined) ?? firstSpan?.start ?? 0;
        return {
            content,
            startOffset: firstStart + 1, // +1 skips the opening backtick
        };
    }

    return EMPTY;
}
