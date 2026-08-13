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
import { nodeStart } from '../ast/node-offsets.js';
import { ChangeDetectionStrategy } from '../models/index.js';
import type {
  ArrayExpression,
  ClassDeclaration,
  ComponentMetadata,
  Decorator,
  Expression,
  HostDirectiveMetadata,
  LiteralValue,
  MetadataValue,
  MissingValue,
  NonLiteralValue,
  ObjectExpression,
} from '../models/index.js';

const NON_LITERAL: NonLiteralValue = { kind: 'non-literal' };
const MISSING: MissingValue = { kind: 'missing' };

const literal = <T>(value: T): LiteralValue<T> => ({ kind: 'literal', value });

const componentCache = new WeakMap<
  ClassDeclaration,
  ComponentMetadata | null
>();

interface CacheStatsAccumulator {
  hits: number;
  misses: number;
}

const cacheStats: CacheStatsAccumulator = { hits: 0, misses: 0 };

export const getComponentCacheStats = (): Readonly<CacheStatsAccumulator> => ({
  hits: cacheStats.hits,
  misses: cacheStats.misses,
});

export const resetComponentCacheStats = (): void => {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
};

export const analyzeComponent = (
  classNode: ClassDeclaration
): ComponentMetadata | null => {
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

const resolveAngularDecoratorName = (
  classNode: ClassDeclaration
): 'Component' | 'Directive' | undefined => {
  if (hasDecorator(classNode, 'Component')) return 'Component';
  if (hasDecorator(classNode, 'Directive')) return 'Directive';
  return undefined;
};

const findDecoratorByName = (
  decorators: readonly Decorator[],
  name: string
): Decorator | undefined => {
  for (let i = 0; i < decorators.length; i++) {
    if (getDecoratorNameUnsafe(decorators[i]) === name) return decorators[i];
  }
  return undefined;
};

const buildComponentMetadata = (
  classNode: ClassDeclaration,
  decorator: Decorator,
  decoratorName: 'Component' | 'Directive'
): ComponentMetadata => {
  const isComp = decoratorName === 'Component';
  const metadataObject = getDecoratorObjectArgUnsafe(decorator);

  return {
    className: classNode.id?.name,
    selector: metadataObject
      ? extractLiteralStringField(metadataObject, 'selector')
      : MISSING,
    changeDetection:
      isComp && metadataObject
        ? extractChangeDetection(metadataObject)
        : MISSING,
    standalone: metadataObject ? extractStandalone(metadataObject) : MISSING,
    templateUrl:
      isComp && metadataObject
        ? extractLiteralStringField(metadataObject, 'templateUrl')
        : MISSING,
    template:
      isComp && metadataObject
        ? extractLiteralStringField(metadataObject, 'template')
        : MISSING,
    hostDirectives: metadataObject
      ? extractHostDirectives(metadataObject)
      : MISSING,
    decoratorStart: nodeStart(decorator),
    type: decoratorName,
  };
};

const extractLiteralStringField = (
  obj: ObjectExpression,
  field: string
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
  obj: ObjectExpression
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
  obj: ObjectExpression
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

const parseHostDirectiveElement = (
  el: Expression
): HostDirectiveMetadata | null => {
  const direct = getIdentifierName(el);
  if (direct !== undefined) {
    return { directive: direct, inputs: [], outputs: [] };
  }

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
  node: Expression | undefined
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

const parseRenameString = (
  value: string
): { internal: string; external: string } => {
  const idx = value.indexOf(':');
  if (idx === -1) return { internal: value, external: value };
  return {
    internal: value.slice(0, idx).trim(),
    external: value.slice(idx + 1).trim(),
  };
};

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
