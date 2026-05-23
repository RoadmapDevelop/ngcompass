/**
 * @fileoverview
 * Cached `@Component` / `@Directive` metadata extractor.
 *
 * Walks a class declaration's decorator, normalizes every interesting
 * metadata field into a tri-state value (literal / non-literal / missing),
 * and caches the result in a `WeakMap` so repeated analysis of the same
 * class is O(1). The tri-state representation lets downstream rules
 * distinguish "field absent" from "field present but dynamic" without
 * re-traversing the decorator AST.
 */

import {
    getDecoratorNameUnsafe,
    getDecoratorObjectArgUnsafe,
    getIdentifierName,
    getLiteralBooleanValueUnsafe,
    getLiteralStringValueUnsafe,
    getObjectPropertyUnsafe,
    hasDecorator,
    matchesMemberExpression,
} from '../ast/matchers.js';
import { nodeStart } from '../ast/types.js';
import type {
    ArrayExpression,
    ClassDeclaration,
    Decorator,
    Expression,
    ObjectExpression,
} from '../ast/types.js';

// ── Tri-state metadata values ──────────────────────────────────────────────

export type LiteralValue<T> = { readonly kind: 'literal'; readonly value: T };
export type NonLiteralValue = { readonly kind: 'non-literal' };
export type MissingValue = { readonly kind: 'missing' };

export type MetadataValue<T> = LiteralValue<T> | NonLiteralValue | MissingValue;

const NON_LITERAL: NonLiteralValue = { kind: 'non-literal' };
const MISSING: MissingValue = { kind: 'missing' };

const literal = <T>(value: T): LiteralValue<T> => ({ kind: 'literal', value });

// ── Public types ───────────────────────────────────────────────────────────

/**
 * Numeric encoding of `ChangeDetectionStrategy`.
 *
 * Declared as an `as const` object (not a TypeScript `enum`) so the values
 * are tree-shakeable and produce no runtime helper code. The numeric values
 * match Angular's own enum (`Default = 0`, `OnPush = 1`) so tests asserting
 * on the raw value continue to work.
 */
export const ChangeDetectionStrategy = {
    Default: 0,
    OnPush: 1,
} as const;

export type ChangeDetectionStrategy =
    typeof ChangeDetectionStrategy[keyof typeof ChangeDetectionStrategy];

export interface HostDirectiveMetadata {
    readonly directive: string | undefined;
    readonly inputs: ReadonlyArray<{ readonly internal: string; readonly external: string }>;
    readonly outputs: ReadonlyArray<{ readonly internal: string; readonly external: string }>;
}

export interface ComponentMetadata {
    readonly className: string | undefined;
    readonly selector: MetadataValue<string>;
    readonly changeDetection: MetadataValue<ChangeDetectionStrategy>;
    readonly standalone: MetadataValue<boolean>;
    readonly templateUrl: MetadataValue<string>;
    readonly template: MetadataValue<string>;
    readonly hostDirectives: MetadataValue<ReadonlyArray<HostDirectiveMetadata>>;
    readonly decoratorStart: number;
    readonly type: 'Component' | 'Directive';
}

// ── Cache ──────────────────────────────────────────────────────────────────

const componentCache = new WeakMap<ClassDeclaration, ComponentMetadata | null>();

interface CacheStatsAccumulator {
    hits: number;
    misses: number;
}

// Module-level mutable counters: deliberate. The WeakMap above and these
// stats are the single concession to non-pure state in this module — both
// are kept private and exposed through accessor helpers below.
const cacheStats: CacheStatsAccumulator = { hits: 0, misses: 0 };

/** Returns a snapshot of cache hit/miss counters. */
export const getComponentCacheStats = (): Readonly<CacheStatsAccumulator> => ({
    hits: cacheStats.hits,
    misses: cacheStats.misses,
});

/** Resets the cache hit/miss counters. Tests call this between cases. */
export const resetComponentCacheStats = (): void => {
    cacheStats.hits = 0;
    cacheStats.misses = 0;
};

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Analyzes `@Component` / `@Directive` decorator metadata on `classNode`.
 * Returns `null` when the class carries neither decorator.
 *
 * @param classNode - Class declaration to inspect.
 * @returns Cached `ComponentMetadata` (same reference on repeat calls) or `null`.
 */
export const analyzeComponent = (classNode: ClassDeclaration): ComponentMetadata | null => {
    const cached = componentCache.get(classNode);
    if (cached !== undefined) {
        cacheStats.hits++;
        return cached;
    }
    cacheStats.misses++;

    const decoratorName = resolveAngularDecoratorName(classNode);
    if (!decoratorName) {
        componentCache.set(classNode, null);
        return null;
    }

    const decorator = findDecoratorByName(classNode.decorators!, decoratorName);
    if (!decorator) {
        componentCache.set(classNode, null);
        return null;
    }

    const metadata = buildComponentMetadata(classNode, decorator, decoratorName);
    componentCache.set(classNode, metadata);
    return metadata;
};

// ── Decorator resolution ───────────────────────────────────────────────────

/** Returns `'Component'`, `'Directive'`, or `undefined` if neither is present. */
const resolveAngularDecoratorName = (
    classNode: ClassDeclaration,
): 'Component' | 'Directive' | undefined => {
    if (hasDecorator(classNode, 'Component')) return 'Component';
    if (hasDecorator(classNode, 'Directive')) return 'Directive';
    return undefined;
};

/** Finds the first decorator whose name matches `name`. */
const findDecoratorByName = (
    decorators: readonly Decorator[],
    name: string,
): Decorator | undefined => {
    for (let i = 0; i < decorators.length; i++) {
        if (getDecoratorNameUnsafe(decorators[i]) === name) return decorators[i];
    }
    return undefined;
};

// ── Metadata builder ───────────────────────────────────────────────────────

const buildComponentMetadata = (
    classNode: ClassDeclaration,
    decorator: Decorator,
    decoratorName: 'Component' | 'Directive',
): ComponentMetadata => {
    const isComp = decoratorName === 'Component';
    const metadataObject = getDecoratorObjectArgUnsafe(decorator);

    return {
        className: classNode.id?.name,
        selector: metadataObject ? extractLiteralStringField(metadataObject, 'selector') : MISSING,
        changeDetection:
            isComp && metadataObject ? extractChangeDetection(metadataObject) : MISSING,
        standalone: metadataObject ? extractStandalone(metadataObject) : MISSING,
        templateUrl:
            isComp && metadataObject ? extractLiteralStringField(metadataObject, 'templateUrl') : MISSING,
        template:
            isComp && metadataObject ? extractLiteralStringField(metadataObject, 'template') : MISSING,
        hostDirectives: metadataObject ? extractHostDirectives(metadataObject) : MISSING,
        decoratorStart: nodeStart(decorator),
        type: decoratorName,
    };
};

// ── Field extractors ───────────────────────────────────────────────────────

/**
 * Generic extractor for any object-literal field whose value should be a
 * string literal. Used by `selector`, `template`, and `templateUrl` — the
 * three near-identical extractors that previously lived as separate copies.
 */
const extractLiteralStringField = (
    obj: ObjectExpression,
    field: string,
): MetadataValue<string> => {
    const node = getObjectPropertyUnsafe(obj, field);
    if (!node) return MISSING;
    const value = getLiteralStringValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractStandalone = (obj: ObjectExpression): MetadataValue<boolean> => {
    const node = getObjectPropertyUnsafe(obj, 'standalone');
    if (!node) return MISSING;
    const value = getLiteralBooleanValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractChangeDetection = (
    obj: ObjectExpression,
): MetadataValue<ChangeDetectionStrategy> => {
    const node = getObjectPropertyUnsafe(obj, 'changeDetection');
    if (!node) return MISSING;

    const direct = getIdentifierName(node);
    if (direct === 'OnPush') return literal(ChangeDetectionStrategy.OnPush);
    if (direct === 'Default') return literal(ChangeDetectionStrategy.Default);
    if (direct !== undefined) return NON_LITERAL;

    if (matchesMemberExpression(node, 'ChangeDetectionStrategy', 'OnPush')) {
        return literal(ChangeDetectionStrategy.OnPush);
    }
    if (matchesMemberExpression(node, 'ChangeDetectionStrategy', 'Default')) {
        return literal(ChangeDetectionStrategy.Default);
    }
    return NON_LITERAL;
};

const extractHostDirectives = (
    obj: ObjectExpression,
): MetadataValue<ReadonlyArray<HostDirectiveMetadata>> => {
    const node = getObjectPropertyUnsafe(obj, 'hostDirectives');
    if (!node) return MISSING;
    if (node.type !== 'ArrayExpression') return NON_LITERAL;

    const elements = (node as ArrayExpression).elements;
    const results: HostDirectiveMetadata[] = [];

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;
        const parsed = parseHostDirectiveElement(el);
        if (parsed) results.push(parsed);
    }

    return literal(results);
};

/** Parses one entry of the `hostDirectives` array. */
const parseHostDirectiveElement = (el: Expression): HostDirectiveMetadata | null => {
    // Bare class reference: hostDirectives: [MyDir]
    const direct = getIdentifierName(el);
    if (direct !== undefined) {
        return { directive: direct, inputs: [], outputs: [] };
    }

    // Object form: hostDirectives: [{ directive: MyDir, inputs: [...], outputs: [...] }]
    if (el.type === 'ObjectExpression') {
        const objExpr = el as ObjectExpression;
        const dirNode = getObjectPropertyUnsafe(objExpr, 'directive');
        return {
            directive: dirNode ? getIdentifierName(dirNode) : undefined,
            inputs: extractRenames(getObjectPropertyUnsafe(objExpr, 'inputs')),
            outputs: extractRenames(getObjectPropertyUnsafe(objExpr, 'outputs')),
        };
    }

    return null;
};

const extractRenames = (
    node: Expression | undefined,
): ReadonlyArray<{ internal: string; external: string }> => {
    if (!node || node.type !== 'ArrayExpression') return [];
    const elements = (node as ArrayExpression).elements;
    const renames: { internal: string; external: string }[] = [];
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;
        const value = getLiteralStringValueUnsafe(el);
        if (!value) continue;
        renames.push(parseRenameString(value));
    }
    return renames;
};

/**
 * Parses `"internalName: externalName"` (with arbitrary whitespace) into a
 * rename pair. Strings without a `:` are treated as same-name renames.
 *
 * Multi-colon strings (`"a:b:c"`) are not Angular's documented syntax;
 * we split on the first `:` only so the remainder lives in `external`.
 */
const parseRenameString = (value: string): { internal: string; external: string } => {
    const idx = value.indexOf(':');
    if (idx === -1) return { internal: value, external: value };
    return {
        internal: value.slice(0, idx).trim(),
        external: value.slice(idx + 1).trim(),
    };
};

// ── High-level convenience checks ──────────────────────────────────────────

export const isComponent = (classNode: ClassDeclaration): boolean =>
    analyzeComponent(classNode) !== null;

export const usesOnPush = (classNode: ClassDeclaration): boolean => {
    const component = analyzeComponent(classNode);
    if (!component) return false;
    const cd = component.changeDetection;
    return cd.kind === 'literal' && cd.value === ChangeDetectionStrategy.OnPush;
};

export const isStandalone = (classNode: ClassDeclaration): boolean => {
    const component = analyzeComponent(classNode);
    if (!component) return false;
    const standalone = component.standalone;
    return standalone.kind === 'literal' && standalone.value === true;
};

