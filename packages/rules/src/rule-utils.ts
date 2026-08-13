import { RuleContext } from '@ngcompass/common';
import type { AstNode } from './models/index.js';


export function unwrapNode(node: AstNode | null | undefined): AstNode | null {
  let current: AstNode | null | undefined = node;
  while (current) {
    const t = current.type;
    if (
      t === 'ChainExpression' ||
      t === 'TSNonNullExpression' ||
      t === 'TSAsExpression' ||
      t === 'ParenthesizedExpression' ||
      t === 'TSInstantiationExpression' ||
      t === 'TSSatisfiesExpression'
    ) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current ?? null;
}

export function isMemberExpressionLike(
  node: AstNode | null | undefined
): boolean {
  const t = node?.type;
  return (
    t === 'MemberExpression' ||
    t === 'StaticMemberExpression' ||
    t === 'OptionalMemberExpression'
  );
}

export function getStaticPropertyName(
  member: AstNode | null | undefined
): string {
  if (!member) return '';
  const prop = member.property;
  if (!prop) return '';

  if (!member.computed) return (prop.name as string) ?? '';

  if (prop.type === 'Literal' && typeof prop.value === 'string')
    return prop.value;

  return '';
}

export function getNodeStart(node: AstNode | null | undefined): number {
  if (!node) return 0;
  return (node.start as number) ?? (node.span?.start as number) ?? 0;
}

export function isCalleeNamed(
  calleeRaw: AstNode | null | undefined,
  name: string
): boolean {
  const callee = unwrapNode(calleeRaw);
  if (!callee) return false;

  if (callee.type === 'Identifier') return (callee.name ?? '') === name;

  if (isMemberExpressionLike(callee))
    return getStaticPropertyName(callee) === name;

  return false;
}

export function getCalleeName(callExprRaw: AstNode | null | undefined): string {
  const call = unwrapNode(callExprRaw);
  if (!call || call.type !== 'CallExpression') return '';

  const callee = unwrapNode(call.callee);
  if (callee?.type === 'Identifier') return (callee.name as string) ?? '';
  if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee);

  return '';
}

export function isSubscribeCall(node: AstNode | null | undefined): boolean {
  const callee = unwrapNode(node?.callee);
  if (!isMemberExpressionLike(callee)) return false;
  return getStaticPropertyName(callee) === 'subscribe';
}

export function getObjectProperty(
  objExpr: AstNode | null | undefined,
  name: string
): AstNode | null {
  if (!objExpr || objExpr.type !== 'ObjectExpression') return null;

  const props = objExpr.properties;
  if (!Array.isArray(props)) return null;

  for (const prop of props) {
    if (!prop || prop.type !== 'Property') continue;
    const key = prop.key;
    const keyName =
      key?.type === 'Identifier'
        ? key.name
        : key?.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : '';
    if (keyName === name) return prop;
  }

  return null;
}

export function isLiteralTrue(node: AstNode | null | undefined): boolean {
  const n = unwrapNode(node);
  return Boolean(n && n.type === 'Literal' && n.value === true);
}

export function isLiteralNullOrUndefined(
  node: AstNode | null | undefined
): boolean {
  const n = unwrapNode(node);
  if (!n) return true;
  if (n.type === 'Literal' && n.value === null) return true;
  if (n.type === 'Identifier' && n.name === 'undefined') return true;
  return false;
}

const SKIP_CHILD_KEYS = new Set([
  'parent',
  'span',
  'loc',
  'range',
  'start',
  'end',
  'type',
]);

export function* childNodes(
  node: AstNode | null | undefined
): Iterable<AstNode> {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const el of node) {
      if (el && typeof el === 'object') yield el as AstNode;
    }
    return;
  }

  for (const key in node) {
    if (SKIP_CHILD_KEYS.has(key)) continue;

    const value = (node as Record<string, unknown>)[key];
    if (!value) continue;

    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === 'object') yield el as AstNode;
      }
    } else if (typeof value === 'object' && (value as AstNode).type) {
      yield value as AstNode;
    }
  }
}

export function isConstructorMethod(def: AstNode | null | undefined): boolean {
  if (!def) return false;
  if (def.kind === 'constructor') return true;
  const key = def.key;
  if (key?.type === 'Identifier' && key.name === 'constructor') return true;
  if (key?.type === 'Literal' && key.value === 'constructor') return true;
  return false;
}

export function isMethodDefinition(
  member: AstNode | null | undefined
): boolean {
  if (!member) return false;
  const t = member.type;
  return (
    t === 'MethodDefinition' ||
    t === 'TSAbstractMethodDefinition' ||
    t === 'ClassMethod' ||
    t === 'MethodDeclaration'
  );
}

export function getConstructorMember(classBody: AstNode[]): AstNode | null {
  for (const m of classBody) {
    if (!m) continue;
    if (!isMethodDefinition(m)) continue;
    if (isConstructorMethod(m)) return m;
  }
  return null;
}

export function getMethodBody(def: AstNode | null | undefined): AstNode | null {
  if (!def) return null;
  const value = (def.value ?? def) as AstNode;
  return (value?.body as AstNode) ?? null;
}

export function getMethodName(def: AstNode | null | undefined): string {
  const key = def?.key;
  if (!key) return '<method>';
  if (key.type === 'Identifier') return (key.name as string) ?? '<method>';
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return '<method>';
}

export function getClassBody(classNode: AstNode | null | undefined): AstNode[] {
  if (!classNode) return [];
  const body = classNode.body;
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && 'body' in body) {
    const inner = (body as { body?: AstNode[] }).body;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export function isAllowedEffectCall(
  callExprRaw: AstNode | null | undefined
): boolean {
  const callExpr = unwrapNode(callExprRaw);
  if (!callExpr || callExpr.type !== 'CallExpression') return false;

  const args = callExpr.arguments;
  if (!Array.isArray(args) || args.length < 2) return false;

  const options = unwrapNode(args[1]);
  if (!options || options.type !== 'ObjectExpression') return false;

  const injectorProp = getObjectProperty(options, 'injector');
  if (injectorProp && !isLiteralNullOrUndefined(injectorProp.value as AstNode))
    return true;

  const manualCleanupProp = getObjectProperty(options, 'manualCleanup');
  if (manualCleanupProp && isLiteralTrue(manualCleanupProp.value as AstNode))
    return true;

  return false;
}

export function findEffectCalls(root: AstNode | null | undefined): AstNode[] {
  if (!root) return [];
  const hits: AstNode[] = [];
  const stack: AstNode[] = [root];

  while (stack.length) {
    const node = stack.pop()!;
    const n = unwrapNode(node);
    if (!n) continue;

    if (n.type === 'CallExpression') {
      if (isCalleeNamed(n.callee, 'effect') && !isAllowedEffectCall(n)) {
        hits.push(n);
      }
    }

    for (const child of childNodes(n)) {
      stack.push(child);
    }
  }

  return hits;
}

export function getCallbackArg(
  callExpr: AstNode | null | undefined
): AstNode | null {
  const args = callExpr?.arguments;
  if (!Array.isArray(args) || args.length === 0) return null;

  const cb = unwrapNode(args[0]);
  if (!cb) return null;

  if (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression')
    return cb;
  return null;
}

export function getFunctionBody(
  fn: AstNode | null | undefined
): AstNode | null {
  if (!fn) return null;
  const body = fn.body;
  return body ? unwrapNode(body as AstNode) : null;
}

export function collectRxjsAliases(
  sourceText: string | undefined,
  exportedName: string
): Set<string> {
  const names = new Set<string>([exportedName]);
  if (typeof sourceText !== 'string' || sourceText.length === 0) return names;

  const patterns: RegExp[] = [
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]rxjs['"]/g,
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]rxjs\/[^'"]+['"]/g,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceText)) !== null) {
      const inside = match[1] ?? '';
      const parts = inside
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const part of parts) {
        const m = new RegExp(
          `^${exportedName}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`
        ).exec(part);
        if (!m) continue;
        names.add(m[1] ?? exportedName);
      }
    }
  }

  return names;
}

export function collectAllRxjsAliases(
  sourceText: string | undefined,
  exportedNames: ReadonlySet<string>
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>(
    [...exportedNames].map((name) => [name, new Set([name])])
  );

  if (typeof sourceText !== 'string' || sourceText.length === 0) return result;

  const aliasPatternsByName = new Map<string, RegExp>(
    [...exportedNames].map((name) => [
      name,
      new RegExp(`^${name}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`),
    ])
  );

  const importPatterns: RegExp[] = [
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]rxjs['"]/g,
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]rxjs\/[^'"]+['"]/g,
  ];

  for (const importPattern of importPatterns) {
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importPattern.exec(sourceText)) !== null) {
      const specifiers = (importMatch[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const specifier of specifiers) {
        for (const [exportedName, aliasPattern] of aliasPatternsByName) {
          const aliasMatch = aliasPattern.exec(specifier);
          if (!aliasMatch) continue;
          result.get(exportedName)!.add(aliasMatch[1] ?? exportedName);
        }
      }
    }
  }

  return result;
}

export const VALID_TEARDOWN_OPERATORS = new Set([
  'takeUntilDestroyed',
  'takeUntil',
  'take',
  'first',
  'takeWhile',
]);

export function getOperatorNameFromPipeArg(
  arg: AstNode | null | undefined
): string {
  const node = unwrapNode(arg);
  if (!node) return '';

  if (node.type === 'Identifier') return (node.name as string) ?? '';

  if (node.type === 'CallExpression') {
    const callee = unwrapNode(node.callee);
    if (callee?.type === 'Identifier') return (callee.name as string) ?? '';
    if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee);
    return '';
  }

  if (isMemberExpressionLike(node)) return getStaticPropertyName(node);

  return '';
}

export function hasTeardownInPipeCall(pipeCall: AstNode): boolean {
  const args = pipeCall.arguments;
  if (!Array.isArray(args)) return false;

  for (const arg of args) {
    if (VALID_TEARDOWN_OPERATORS.has(getOperatorNameFromPipeArg(arg)))
      return true;
  }
  return false;
}

export function hasTeardownInReceiverChain(
  receiverExpr: AstNode | null | undefined
): boolean {
  let current = receiverExpr;

  while (current) {
    const node = unwrapNode(current);
    if (!node || node.type !== 'CallExpression') break;

    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) break;

    if (getStaticPropertyName(callee) === 'pipe' && hasTeardownInPipeCall(node))
      return true;

    current = callee?.object;
  }

  return false;
}

export function getTemplateAbsoluteOffset(
  _context: { template?: { templateStartOffset?: number } },
  nodeStart: number
): number {
  return nodeStart;
}

const HTTP_CLIENT_VERBS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'jsonp',
  'request',
]);

const HTTP_CLIENT_PROP_NAMES = new Set([
  'http',
  'httpClient',
  '_http',
  '_httpClient',
]);

const HTTP_ACTION_PREFIXES: readonly string[] = [
  'get',
  'fetch',
  'load',
  'save',
  'create',
  'update',
  'delete',
  'remove',
  'submit',
  'send',
  'post',
  'put',
  'patch',
  'upload',
  'download',
];

export function findObservableSourceCall(
  receiverExpr: AstNode | null | undefined
): AstNode | null {
  let current: AstNode | null | undefined = receiverExpr;
  while (current) {
    const node = unwrapNode(current);
    if (!node || node.type !== 'CallExpression') break;

    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) break;

    if (getStaticPropertyName(callee) !== 'pipe') return node;

    current = callee?.object;
  }
  return null;
}

export function isLikelyHttpObservable(
  sourceCall: AstNode | null | undefined
): boolean {
  if (!sourceCall) return false;

  const node = unwrapNode(sourceCall);
  if (!node || node.type !== 'CallExpression') return false;

  const callee = unwrapNode(node.callee);
  if (!isMemberExpressionLike(callee)) return false;

  const methodName = getStaticPropertyName(callee);
  if (!methodName) return false;

  const receiverObj = unwrapNode(callee?.object);
  const args = Array.isArray(node.arguments) ? node.arguments : [];

  if (
    HTTP_CLIENT_VERBS.has(methodName) &&
    isMemberExpressionLike(receiverObj)
  ) {
    const httpPropName = getStaticPropertyName(receiverObj);
    if (HTTP_CLIENT_PROP_NAMES.has(httpPropName)) return true;
  }

  if (args.length > 0) {
    const lower = methodName.toLowerCase();
    for (const prefix of HTTP_ACTION_PREFIXES) {
      if (lower.startsWith(prefix) && methodName.length > prefix.length)
        return true;
    }
  }

  return false;
}

export function getParamsArray(
  funcNode: AstNode | null | undefined
): AstNode[] {
  if (!funcNode) return [];
  const params = funcNode.params;
  if (Array.isArray(params)) return params;
  if (params && typeof params === 'object') {
    if (
      'items' in params &&
      Array.isArray((params as { items?: unknown }).items)
    )
      return (params as { items: AstNode[] }).items;
    if (
      'elements' in params &&
      Array.isArray((params as { elements?: unknown }).elements)
    )
      return (params as { elements: AstNode[] }).elements;
  }
  return [];
}

export function getParamIdentifierName(
  param: AstNode | null | undefined
): string {
  const p = unwrapNode(param);
  if (!p) return '';

  if (p.type === 'Identifier') return (p.name as string) ?? '';

  if (p.type === 'TSParameterProperty') {
    return getParamIdentifierName(p.parameter as AstNode);
  }

  if (p.type === 'AssignmentPattern') {
    const left = unwrapNode(p.left);
    return left?.type === 'Identifier' ? ((left.name as string) ?? '') : '';
  }

  if (p.type === 'RestElement') {
    const arg = unwrapNode(p.argument);
    return arg?.type === 'Identifier' ? ((arg.name as string) ?? '') : '';
  }

  return '';
}

export function getParamTypeName(param: AstNode | null | undefined): string {
  const p = unwrapNode(param);
  if (!p) return '';

  if (p.type === 'TSParameterProperty') {
    return getParamTypeName(p.parameter as AstNode);
  }

  const typeAnnotation = p.typeAnnotation;
  const typeNode = typeAnnotation?.typeAnnotation ?? typeAnnotation;
  const t = unwrapNode(typeNode);
  if (!t) return '';

  if (t.type === 'TSTypeReference' || t.type === 'TypeReference') {
    const typeName = t.typeName ?? t.name;
    if (typeName && typeof typeName === 'object') {
      const tn = typeName;
      if (tn.type === 'Identifier') return (tn.name as string) ?? '';
      if (tn.type === 'TSQualifiedName')
        return ((tn.right as AstNode)?.name as string) ?? '';
    }
    if (typeof typeName === 'string') return typeName;
  }

  return '';
}

let _tsModule: typeof import('typescript') | undefined;
let _tsModuleLoaded = false;

function requireTypescript(): typeof import('typescript') | undefined {
  if (!_tsModuleLoaded) {
    try {
      _tsModule = require('typescript') as typeof import('typescript');
    } catch {}
    _tsModuleLoaded = true;
  }
  return _tsModule;
}

export function getTsSymbolAtNode(
  oxcNode: AstNode | null | undefined,
  context: RuleContext
): import('typescript').Symbol | undefined {
  if (!oxcNode || !context.typeChecker) return undefined;

  const ts = requireTypescript();
  if (!ts) return undefined;

  try {
    type ContextWithSourceFile = RuleContext & {
      sourceFile?: import('typescript').SourceFile;
    };
    const ctx = context as ContextWithSourceFile;
    if (!ctx.sourceFile && context.fileContent) {
      ctx.sourceFile = ts.createSourceFile(
        context.filePath,
        context.fileContent,
        ts.ScriptTarget.Latest,
        true
      );
    }

    const sourceFile = ctx.sourceFile;
    if (!sourceFile) return undefined;

    const tsNode = findTsNodeAtPosition(sourceFile, getNodeStart(oxcNode), ts);
    if (!tsNode) return undefined;

    return context.typeChecker.getSymbolAtLocation(tsNode);
  } catch {
    return undefined;
  }
}

const INJECTABLE_SYMBOL_SUFFIXES: readonly string[] = [
  'Service',
  'Facade',
  'Store',
  'Client',
  'Repository',
  'Adapter',
  'Controller',
  'Provider',
  'Registry',
  'Logger',
  'Router',
  'Injector',
  'Handler',
  'Interceptor',
  'Guard',
  'Resolver',
  'Validator',
];

export function isLikelyAngularInjectableSymbol(
  symbol: import('typescript').Symbol | undefined
): boolean {
  if (!symbol) return false;

  const ts = requireTypescript();
  if (!ts) return false;

  try {
    const name = symbol.getName();
    if (INJECTABLE_SYMBOL_SUFFIXES.some((suffix) => name.endsWith(suffix)))
      return true;

    const decls = symbol.getDeclarations();
    if (!decls || decls.length === 0) return false;

    const decl = decls[0];
    if (!ts.canHaveDecorators(decl)) return false;

    const decorators = ts.getDecorators(decl) ?? [];
    for (const dec of decorators) {
      const expr = dec.expression;
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
        if (expr.expression.text === 'Injectable') return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function findTsNodeAtPosition(
  root: import('typescript').Node,
  pos: number,
  ts: typeof import('typescript')
): import('typescript').Node | undefined {
  if (pos < root.getStart() || pos >= root.getEnd()) return undefined;

  let current: import('typescript').Node = root;

  for (;;) {
    const child = ts.forEachChild(current, (c) => {
      if (pos >= c.getStart() && pos < c.getEnd()) return c;
      return undefined;
    });

    if (!child) break;
    current = child;
  }

  return current;
}

export function ensureRuleSourceFile(
  context: RuleContext
): import('typescript').SourceFile | undefined {
  type Mutable = RuleContext & { sourceFile?: import('typescript').SourceFile };
  const mutable = context as Mutable;
  if (mutable.sourceFile) return mutable.sourceFile;
  if (!context.fileContent) return undefined;

  const ts = requireTypescript();
  if (!ts) return undefined;

  mutable.sourceFile = ts.createSourceFile(
    context.filePath,
    context.fileContent,
    ts.ScriptTarget.Latest,
    true
  );
  return mutable.sourceFile;
}

const componentFileCache = new Map<string, boolean>();
const COMPONENT_FILE_CACHE_LIMIT = 1024;

export function isAngularComponentOrDirectiveFile(
  context: RuleContext
): boolean {
  const cached = componentFileCache.get(context.filePath);
  if (cached !== undefined) return cached;

  const result = computeIsComponentOrDirectiveFile(context);

  if (componentFileCache.size >= COMPONENT_FILE_CACHE_LIMIT) {
    componentFileCache.clear();
  }
  componentFileCache.set(context.filePath, result);
  return result;
}

const TS_LIB_PATH_MARKER = '/typescript/lib/lib.';

const TS_DOM_LIB_PATH_MARKER = '/typescript/lib/lib.dom';

export function isTypeScriptLibSymbol(
  symbol: import('typescript').Symbol | undefined
): boolean {
  if (!symbol) return false;
  const declarations = symbol.getDeclarations();
  if (!declarations) return false;
  for (const decl of declarations) {
    const file = decl.getSourceFile().fileName.replace(/\\/g, '/');
    if (file.includes(TS_LIB_PATH_MARKER)) return true;
  }
  return false;
}

export function isDomLibSymbol(
  symbol: import('typescript').Symbol | undefined
): boolean {
  if (!symbol) return false;
  const declarations = symbol.getDeclarations();
  if (!declarations) return false;
  for (const decl of declarations) {
    const file = decl.getSourceFile().fileName.replace(/\\/g, '/');
    if (file.includes(TS_DOM_LIB_PATH_MARKER)) return true;
  }
  return false;
}

function computeIsComponentOrDirectiveFile(context: RuleContext): boolean {
  const { typeChecker, angularTypes } = context;
  if (!typeChecker || !angularTypes) return false;

  const ts = requireTypescript();
  const sourceFile = ensureRuleSourceFile(context);
  if (!ts || !sourceFile) return false;

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !ts.canHaveDecorators(statement))
      continue;

    const decorators = ts.getDecorators(statement);
    if (!decorators) continue;

    for (const dec of decorators) {
      const expr = ts.isCallExpression(dec.expression)
        ? dec.expression.expression
        : dec.expression;
      if (!ts.isIdentifier(expr)) continue;
      if (expr.text !== 'Component' && expr.text !== 'Directive') continue;

      const symbol = typeChecker.getSymbolAtLocation(expr);
      const resolved =
        symbol && symbol.flags & ts.SymbolFlags.Alias
          ? typeChecker.getAliasedSymbol(symbol)
          : symbol;
      if (angularTypes.isFromAngularCore(resolved)) return true;
    }
  }
  return false;
}
