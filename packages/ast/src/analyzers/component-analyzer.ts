import type { ClassDeclaration } from '../ast/types.js';
import {
    hasDecorator,
    getDecoratorNameUnsafe,
    getDecoratorObjectArgUnsafe,
    getObjectPropertyUnsafe,
    matchesMemberExpression,
    getLiteralStringValueUnsafe,
    getLiteralBooleanValueUnsafe,
} from '../ast/matchers.js';
import type { ArrayExpression, ObjectExpression, Expression, Identifier, Decorator } from '../ast/types.js';

// ============================================
// TRI-STATE METADATA (Literal | Non-Literal | Missing)
// ============================================

export type LiteralValue<T> = { readonly kind: 'literal'; readonly value: T };
export type NonLiteralValue = { readonly kind: 'non-literal' };
export type MissingValue = { readonly kind: 'missing' };

export type MetadataValue<T> = LiteralValue<T> | NonLiteralValue | MissingValue;

const NON_LITERAL: NonLiteralValue = { kind: 'non-literal' };
const MISSING: MissingValue = { kind: 'missing' };

const literal = <T>(value: T): LiteralValue<T> => ({ kind: 'literal', value });

// ============================================
// COMPONENT METADATA
// ============================================

export enum ChangeDetectionStrategy {
    Default = 0,
    OnPush = 1,
}

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

// ============================================
// CACHE
// ============================================

const componentCache = new WeakMap<ClassDeclaration, ComponentMetadata | null>();

interface CacheStatsAccumulator {
    hits: number;
    misses: number;
}

const cacheStats: CacheStatsAccumulator = { hits: 0, misses: 0 };

export const getComponentCacheStats = (): Readonly<CacheStatsAccumulator> =>
    ({ hits: cacheStats.hits, misses: cacheStats.misses });

export const resetComponentCacheStats = (): void => {
    cacheStats.hits = 0;
    cacheStats.misses = 0;
};

// ============================================
// MAIN ANALYZER (Cached)
// ============================================

/**
 * Analyzes @Component / @Directive decorator metadata.
 * Returns null if the class has neither decorator.
 * Results are cached in a WeakMap — O(1) on subsequent calls.
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

// ============================================
// PRIVATE — DECORATOR RESOLUTION
// ============================================

/** Returns 'Component', 'Directive', or undefined if neither is present. */
const resolveAngularDecoratorName = (classNode: ClassDeclaration): 'Component' | 'Directive' | undefined => {
    if (hasDecorator(classNode, 'Component')) return 'Component';
    if (hasDecorator(classNode, 'Directive')) return 'Directive';
    return undefined;
};

/** Finds the first decorator whose name matches `name`. */
const findDecoratorByName = (decorators: readonly Decorator[], name: string): Decorator | undefined => {
    for (let i = 0; i < decorators.length; i++) {
        if (getDecoratorNameUnsafe(decorators[i]) === name) return decorators[i];
    }
    return undefined;
};

// ============================================
// PRIVATE — METADATA BUILDER
// ============================================

const buildComponentMetadata = (
    classNode: ClassDeclaration,
    decorator: Decorator,
    decoratorName: 'Component' | 'Directive',
): ComponentMetadata => {
    const isComp = decoratorName === 'Component';
    const metadataObject = getDecoratorObjectArgUnsafe(decorator);

    return {
        className: classNode.id?.name,
        selector: metadataObject ? extractSelector(metadataObject) : MISSING,
        changeDetection: isComp && metadataObject ? extractChangeDetection(metadataObject) : MISSING,
        standalone: metadataObject ? extractStandalone(metadataObject) : MISSING,
        templateUrl: isComp && metadataObject ? extractTemplateUrl(metadataObject) : MISSING,
        template: isComp && metadataObject ? extractTemplate(metadataObject) : MISSING,
        hostDirectives: metadataObject ? extractHostDirectives(metadataObject) : MISSING,
        decoratorStart: decorator.start ?? decorator.span?.start ?? 0,
        type: decoratorName,
    };
};

// ============================================
// PRIVATE — EXTRACTORS
// ============================================

const extractSelector = (obj: ObjectExpression): MetadataValue<string> => {
    const node = getObjectPropertyUnsafe(obj, 'selector');
    if (!node) return MISSING;
    const value = getLiteralStringValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractChangeDetection = (obj: ObjectExpression): MetadataValue<ChangeDetectionStrategy> => {
    const node = getObjectPropertyUnsafe(obj, 'changeDetection');
    if (!node) return MISSING;

    if (node.type === 'Identifier') {
        const name = (node as any).name;
        if (name === 'OnPush') return literal(ChangeDetectionStrategy.OnPush);
        if (name === 'Default') return literal(ChangeDetectionStrategy.Default);
        return NON_LITERAL;
    }

    if (matchesMemberExpression(node, 'ChangeDetectionStrategy', 'OnPush'))
        return literal(ChangeDetectionStrategy.OnPush);

    if (matchesMemberExpression(node, 'ChangeDetectionStrategy', 'Default'))
        return literal(ChangeDetectionStrategy.Default);

    return NON_LITERAL;
};

const extractStandalone = (obj: ObjectExpression): MetadataValue<boolean> => {
    const node = getObjectPropertyUnsafe(obj, 'standalone');
    if (!node) return MISSING;
    const value = getLiteralBooleanValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractTemplateUrl = (obj: ObjectExpression): MetadataValue<string> => {
    const node = getObjectPropertyUnsafe(obj, 'templateUrl');
    if (!node) return MISSING;
    const value = getLiteralStringValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractTemplate = (obj: ObjectExpression): MetadataValue<string> => {
    const node = getObjectPropertyUnsafe(obj, 'template');
    if (!node) return MISSING;
    const value = getLiteralStringValueUnsafe(node);
    return value !== undefined ? literal(value) : NON_LITERAL;
};

const extractHostDirectives = (obj: ObjectExpression): MetadataValue<ReadonlyArray<HostDirectiveMetadata>> => {
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

/** Parses a single element from the hostDirectives array. */
const parseHostDirectiveElement = (el: Expression): HostDirectiveMetadata | null => {
    // Case 1: bare class reference — [MyDir]
    if (el.type === 'Identifier') {
        return { directive: (el as Identifier).name, inputs: [], outputs: [] };
    }

    // Case 2: object — { directive: MyDir, inputs: [...], outputs: [...] }
    if (el.type === 'ObjectExpression') {
        const obj = el as ObjectExpression;
        const dirNode = getObjectPropertyUnsafe(obj, 'directive');
        const directive = dirNode?.type === 'Identifier' ? (dirNode as Identifier).name : undefined;
        return {
            directive,
            inputs: extractRenames(getObjectPropertyUnsafe(obj, 'inputs')),
            outputs: extractRenames(getObjectPropertyUnsafe(obj, 'outputs')),
        };
    }

    return null;
};

const extractRenames = (node: Expression | undefined): ReadonlyArray<{ internal: string; external: string }> => {
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

/** Parses "internalName: externalName" or "name" into a rename pair. */
const parseRenameString = (value: string): { internal: string; external: string } => {
    if (value.includes(':')) {
        const [internal, external] = value.split(':').map(s => s.trim());
        return { internal, external };
    }
    return { internal: value, external: value };
};

// ============================================
// HIGH-LEVEL CONVENIENCE CHECKS
// ============================================

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
