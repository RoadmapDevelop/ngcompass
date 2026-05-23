/**
 * @fileoverview
 * Pre-filtered semantic node streams.
 *
 * Rules subscribe to the most specific stream possible so the engine can
 * filter and decorate nodes once, in C-fast iteration, rather than having
 * every rule re-walk the AST asking "is this a component?", "is this
 * decorated?". The streams below are the contract between the engine
 * (which calls the filter functions) and the rules (which consume the
 * resulting typed objects).
 *
 * Forbidden in rules:
 *  - Manual "is this a component?" checks → use `AngularClassStream`.
 *  - Manual "is this decorated?" checks → use `DecoratedPropertyStream`.
 *  - Manual node-type discrimination → the dispatcher handles it.
 */

import { analyzeComponent, type ComponentMetadata } from './analyzers/component-analyzer.js';
import { getDecoratorNameUnsafe } from './ast/matchers.js';
import { nodeStart } from './ast/types.js';
import type {
    CallExpression,
    ClassDeclaration,
    Decorator,
    Expression,
    NewExpression,
    PropertyDefinition,
} from './ast/types.js';

// ── Template stream shapes ─────────────────────────────────────────────────

export interface TemplateExpressionNode {
    readonly expression: Expression;
    readonly sourceSpan: { start: number; end: number };
}

export interface TemplateAttributeNode {
    readonly name: string;
    readonly value?: string;
    readonly sourceSpan: { start: number; end: number };
}

export interface TemplateBlockNode {
    readonly name: string;
    readonly parameters: ReadonlyArray<{
        readonly expression: string;
        readonly sourceSpan: { start: number; end: number };
    }>;
    readonly sourceSpan: { start: number; end: number };
}

/** Aggregate result of analyzing one Angular template. */
export interface TemplateAnalysis {
    readonly expressions: ReadonlyArray<TemplateExpressionNode>;
    readonly attributes: ReadonlyArray<TemplateAttributeNode>;
    readonly blocks: ReadonlyArray<TemplateBlockNode>;
}

// ── Class streams ──────────────────────────────────────────────────────────

/**
 * Class declarations carrying `@Component` or `@Directive`, with pre-analyzed
 * (and cached) metadata. Subscribers receive a guarantee that `metadata` is
 * the same object across calls for a given class.
 */
export interface AngularClassNode {
    readonly node: ClassDeclaration;
    readonly metadata: ComponentMetadata;
}

/**
 * Class declarations carrying ANY Angular decorator
 * (`@Component`, `@Directive`, `@Pipe`, `@Injectable`, `@NgModule`).
 *
 * Use this when the rule applies beyond `@Component` / `@Directive` —
 * naming rules for pipes, services, guards, etc.
 */
export interface AnyAngularClassNode {
    readonly node: ClassDeclaration;
    readonly decoratorName: string;
    readonly className: string | undefined;
    readonly decoratorStart: number;
}

/** Property declarations carrying at least one decorator. */
export interface DecoratedPropertyNode {
    readonly node: PropertyDefinition;
    readonly decorators: ReadonlyArray<Decorator>;
}

// ── Stream filters (engine-internal) ───────────────────────────────────────

/**
 * Filters class declarations to Angular components / directives.
 * O(1) after the first call on a given class (cached in `analyzeComponent`).
 */
export const toAngularClassStream = (
    classNode: ClassDeclaration,
): AngularClassNode | null => {
    const metadata = analyzeComponent(classNode);
    if (!metadata) return null;
    return { node: classNode, metadata };
};

/** Angular decorators that qualify a class for `AnyAngularClassStream`. */
const ANY_ANGULAR_DECORATORS = new Set([
    'Component',
    'Directive',
    'Pipe',
    'Injectable',
    'NgModule',
]);

/** Filters class declarations to any Angular-decorated class. */
export const toAnyAngularClassStream = (
    classNode: ClassDeclaration,
): AnyAngularClassNode | null => {
    const decorators = classNode.decorators;
    if (!decorators) return null;
    for (let i = 0; i < decorators.length; i++) {
        const decorator = decorators[i];
        const name = getDecoratorNameUnsafe(decorator);
        if (name && ANY_ANGULAR_DECORATORS.has(name)) {
            return {
                node: classNode,
                decoratorName: name,
                className: classNode.id?.name,
                decoratorStart: nodeStart(decorator),
            };
        }
    }
    return null;
};

/** Filters property definitions to decorated properties. */
export const toDecoratedPropertyStream = (
    propertyNode: PropertyDefinition,
): DecoratedPropertyNode | null => {
    const decorators = propertyNode.decorators;
    if (!decorators || decorators.length === 0) return null;
    return { node: propertyNode, decorators };
};

/** Pass-through filter for the CallExpression stream. */
export const toCallExpressionStream = (node: CallExpression): CallExpression => node;

/** Pass-through filter for the NewExpression stream. */
export const toNewExpressionStream = (node: NewExpression): NewExpression => node;
