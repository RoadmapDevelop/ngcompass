import ts from 'typescript';
import type { AngularTypeIndex } from '@ngcompass/common';

const SIGNAL_TYPE_NAMES = new Set([
  'Signal',
  'WritableSignal',
  'InputSignal',
  'ModelSignal',
  'OutputEmitterRef',
]);
const WRITABLE_SIGNAL_TYPE_NAMES = new Set([
  'WritableSignal',
  'InputSignal',
  'ModelSignal',
]);
const SUBJECT_TYPE_NAMES = new Set([
  'Subject',
  'BehaviorSubject',
  'ReplaySubject',
  'AsyncSubject',
]);

type OriginCache = WeakMap<ts.Symbol, boolean>;

export function createAngularTypeIndex(
  program: ts.Program | undefined
): AngularTypeIndex {
  if (!program) return NULL_INDEX;

  const originCaches = new Map<string, OriginCache>();

  const isFromPackage = (
    symbol: ts.Symbol | undefined,
    packageName: string
  ): boolean => {
    if (!symbol) return false;

    let cache = originCaches.get(packageName);
    if (!cache) {
      cache = new WeakMap();
      originCaches.set(packageName, cache);
    }

    const cached = cache.get(symbol);
    if (cached !== undefined) return cached;

    const resolved = resolveSymbolOrigin(symbol, packageName);
    cache.set(symbol, resolved);
    return resolved;
  };

  const matchesType = (
    type: ts.Type | undefined,
    names: ReadonlySet<string>,
    packageName: string
  ): boolean => {
    if (!type) return false;
    const symbol = type.aliasSymbol ?? type.symbol;
    if (!symbol) return false;
    if (!names.has(symbol.name)) return false;
    return isFromPackage(symbol, packageName);
  };

  return {
    isFromPackage,

    isFromAngularCore: (symbol) => isFromPackage(symbol, '@angular/core'),

    isSignal: (type) => matchesType(type, SIGNAL_TYPE_NAMES, '@angular/core'),

    isWritableSignal: (type) =>
      matchesType(type, WRITABLE_SIGNAL_TYPE_NAMES, '@angular/core'),

    isObservable: (type) => {
      if (!type) return false;
      const symbol = type.aliasSymbol ?? type.symbol;
      if (!symbol || symbol.name !== 'Observable') return false;
      return isFromPackage(symbol, 'rxjs');
    },

    isSubjectLike: (type) => matchesType(type, SUBJECT_TYPE_NAMES, 'rxjs'),

    isHttpClient: (type) => {
      if (!type) return false;
      const symbol = type.aliasSymbol ?? type.symbol;
      if (!symbol || symbol.name !== 'HttpClient') return false;
      return isFromPackage(symbol, '@angular/common');
    },

    isInjectionToken: (type) => {
      if (!type) return false;
      const symbol = type.aliasSymbol ?? type.symbol;
      if (!symbol || symbol.name !== 'InjectionToken') return false;
      return isFromPackage(symbol, '@angular/core');
    },

    isEventEmitter: (type) => {
      if (!type) return false;
      const symbol = type.aliasSymbol ?? type.symbol;
      if (!symbol || symbol.name !== 'EventEmitter') return false;
      return isFromPackage(symbol, '@angular/core');
    },

    isChangeDetectorRef: (type) => {
      if (!type) return false;
      const symbol = type.aliasSymbol ?? type.symbol;
      if (!symbol || symbol.name !== 'ChangeDetectorRef') return false;
      return isFromPackage(symbol, '@angular/core');
    },

    isInjectableClass: (symbol) => {
      if (!symbol) return false;
      if (hasInjectableDecorator(symbol)) return true;
      return isFromAnyAngularPackage(symbol);
    },
  };
}

const PATH_RE = /\\/g;

function resolveSymbolOrigin(symbol: ts.Symbol, packageName: string): boolean {
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return false;

  const needle = `/node_modules/${packageName}/`;
  for (const decl of declarations) {
    const fileName = decl.getSourceFile().fileName.replace(PATH_RE, '/');
    if (fileName.includes(needle)) return true;
  }
  return false;
}

function isFromAnyAngularPackage(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return false;

  for (const decl of declarations) {
    const fileName = decl.getSourceFile().fileName.replace(PATH_RE, '/');
    if (fileName.includes('/node_modules/@angular/')) return true;
  }
  return false;
}

function hasInjectableDecorator(symbol: ts.Symbol): boolean {
  const decl = symbol.getDeclarations()?.[0];
  if (!decl || !ts.isClassDeclaration(decl)) return false;
  if (!ts.canHaveDecorators(decl)) return false;

  const decorators = ts.getDecorators(decl);
  if (!decorators) return false;

  for (const dec of decorators) {
    const expr = dec.expression;
    const identifier = ts.isCallExpression(expr) ? expr.expression : expr;
    if (ts.isIdentifier(identifier) && identifier.text === 'Injectable')
      return true;
  }
  return false;
}

const NULL_INDEX: AngularTypeIndex = {
  isFromPackage: () => false,
  isFromAngularCore: () => false,
  isSignal: () => false,
  isWritableSignal: () => false,
  isObservable: () => false,
  isSubjectLike: () => false,
  isHttpClient: () => false,
  isInjectionToken: () => false,
  isEventEmitter: () => false,
  isChangeDetectorRef: () => false,
  isInjectableClass: () => false,
};
