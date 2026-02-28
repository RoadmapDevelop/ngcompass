/**
 * Shared Utilities for Migration Rules
 *
 * Consolidated helper functions used across multiple rule files.
 * Eliminates duplication and ensures consistent behavior.
 *
 * PERFORMANCE: All functions are zero-allocation where possible.
 */

import { RuleContext } from '@ngcompass/common';

// ============================================
// AST Node Type (replaces `type AnyNode = any`)
// ============================================

/**
 * Loosely-typed AST node used by migration rules.
 * Provides minimal structure while allowing dynamic property access
 * that the oxc-parser AST requires.
 */
export interface AstNode {
    readonly type?: string;
    readonly start?: number;
    readonly end?: number;
    readonly span?: { start: number; end: number };
    readonly name?: string;
    readonly value?: unknown;
    readonly computed?: boolean;
    readonly operator?: string;
    readonly accessibility?: string;
    readonly readonly?: boolean;
    readonly static?: boolean;
    readonly kind?: string;
    readonly expression?: AstNode;
    readonly callee?: AstNode;
    readonly object?: AstNode;
    readonly property?: AstNode;
    readonly arguments?: AstNode[];
    readonly properties?: AstNode[];
    readonly elements?: AstNode[];
    readonly body?: AstNode | AstNode[] | { body?: AstNode[] };
    readonly params?: AstNode[] | { items?: AstNode[]; elements?: AstNode[] };
    readonly key?: AstNode;
    readonly left?: AstNode;
    readonly right?: AstNode;
    readonly test?: AstNode;
    readonly consequent?: AstNode;
    readonly alternate?: AstNode;
    readonly argument?: AstNode;
    readonly decorators?: AstNode[];
    readonly typeAnnotation?: AstNode;
    readonly typeName?: AstNode;
    readonly initializer?: AstNode;
    readonly parent?: AstNode;
    [key: string]: unknown;
}

// ============================================
// NODE UNWRAPPING
// ============================================

/**
 * Unwraps TS wrapper nodes, parentheses, chain expressions, and instantiation wrappers.
 * Handles all known wrapper node types consistently.
 */
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

// ============================================
// MEMBER EXPRESSION HELPERS
// ============================================

/**
 * Checks if a node is a member expression (static, computed, or optional).
 */
export function isMemberExpressionLike(node: AstNode | null | undefined): boolean {
    const t = node?.type;
    return (
        t === 'MemberExpression' ||
        t === 'StaticMemberExpression' ||
        t === 'OptionalMemberExpression'
    );
}

/**
 * Gets the statically-resolvable property name from a member expression.
 * Returns '' if the name cannot be determined.
 */
export function getStaticPropertyName(member: AstNode | null | undefined): string {
    if (!member) return '';
    const prop = member.property;
    if (!prop) return '';

    if (!member.computed) return (prop.name as string) ?? '';

    if (prop.type === 'Literal' && typeof prop.value === 'string') return prop.value;

    return '';
}

// ============================================
// NODE POSITION
// ============================================

/**
 * Gets the start offset of a node, handling both oxc-parser span and estree start formats.
 */
export function getNodeStart(node: AstNode | null | undefined): number {
    if (!node) return 0;
    return (node.start as number) ?? (node.span?.start as number) ?? 0;
}

// ============================================
// CALLEE MATCHING
// ============================================

/**
 * Checks if a call expression's callee matches a given function name.
 * Handles both direct calls (`fn()`) and member calls (`obj.fn()`).
 */
export function isCalleeNamed(calleeRaw: AstNode | null | undefined, name: string): boolean {
    const callee = unwrapNode(calleeRaw);
    if (!callee) return false;

    if (callee.type === 'Identifier') return (callee.name ?? '') === name;

    if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee) === name;

    return false;
}

/**
 * Gets the name of a call expression's callee.
 */
export function getCalleeName(callExprRaw: AstNode | null | undefined): string {
    const call = unwrapNode(callExprRaw);
    if (!call || call.type !== 'CallExpression') return '';

    const callee = unwrapNode(call.callee);
    if (callee?.type === 'Identifier') return (callee.name as string) ?? '';
    if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee);

    return '';
}

// ============================================
// SUBSCRIBE / PIPE DETECTION
// ============================================

/**
 * Checks if a call expression is a `.subscribe(...)` call.
 */
export function isSubscribeCall(node: AstNode | null | undefined): boolean {
    const callee = unwrapNode(node?.callee);
    if (!isMemberExpressionLike(callee)) return false;
    return getStaticPropertyName(callee) === 'subscribe';
}

// ============================================
// OBJECT PROPERTY HELPERS
// ============================================

/**
 * Gets a property from an ObjectExpression by key name.
 */
export function getObjectProperty(objExpr: AstNode | null | undefined, name: string): AstNode | null {
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

/**
 * Checks if a node is literal `true`.
 */
export function isLiteralTrue(node: AstNode | null | undefined): boolean {
    const n = unwrapNode(node);
    return Boolean(n && n.type === 'Literal' && n.value === true);
}

/**
 * Checks if a node is literal `null` or `undefined`.
 */
export function isLiteralNullOrUndefined(node: AstNode | null | undefined): boolean {
    const n = unwrapNode(node);
    if (!n) return true;
    if (n.type === 'Literal' && n.value === null) return true;
    if (n.type === 'Identifier' && n.name === 'undefined') return true;
    return false;
}

// ============================================
// GENERIC AST TRAVERSAL
// ============================================

/**
 * Keys that are never meaningful AST children — skipped in childNodes() and visitor.ts.
 * Declared at module scope so the Set is created once, not per generator invocation.
 */
const SKIP_CHILD_KEYS = new Set(['parent', 'span', 'loc', 'range', 'start', 'end', 'type']);

/**
 * Yields all direct child AST nodes of a given node.
 *
 * Uses `for...in` instead of `Object.keys()` to avoid allocating an intermediate
 * string array for every invocation. AST nodes are plain objects (POJOs) so
 * inherited enumerable properties are not a concern in practice.
 *
 * Skips well-known non-child keys (parent, span, etc.) via a Set for O(1) lookup.
 */
export function* childNodes(node: AstNode | null | undefined): Iterable<AstNode> {
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

// ============================================
// CLASS / CONSTRUCTOR HELPERS
// ============================================

/**
 * Checks if a method definition is a constructor.
 */
export function isConstructorMethod(def: AstNode | null | undefined): boolean {
    if (!def) return false;
    if (def.kind === 'constructor') return true;
    const key = def.key;
    if (key?.type === 'Identifier' && key.name === 'constructor') return true;
    if (key?.type === 'Literal' && key.value === 'constructor') return true;
    return false;
}

/**
 * Checks if a member is a method definition.
 */
export function isMethodDefinition(member: AstNode | null | undefined): boolean {
    if (!member) return false;
    const t = member.type;
    return (
        t === 'MethodDefinition' ||
        t === 'TSAbstractMethodDefinition' ||
        t === 'ClassMethod' ||
        t === 'MethodDeclaration'
    );
}

/**
 * Gets the constructor member from a class body array.
 */
export function getConstructorMember(classBody: AstNode[]): AstNode | null {
    for (const m of classBody) {
        if (!m) continue;
        if (!isMethodDefinition(m)) continue;
        if (isConstructorMethod(m)) return m;
    }
    return null;
}

/**
 * Gets the method body from a method definition.
 */
export function getMethodBody(def: AstNode | null | undefined): AstNode | null {
    if (!def) return null;
    const value = (def.value ?? def) as AstNode;
    return (value?.body as AstNode) ?? null;
}

/**
 * Gets the method name from a method definition.
 */
export function getMethodName(def: AstNode | null | undefined): string {
    const key = def?.key;
    if (!key) return '<method>';
    if (key.type === 'Identifier') return (key.name as string) ?? '<method>';
    if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
    return '<method>';
}

/**
 * Gets the class body as an array from a class node.
 */
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

// ============================================
// EFFECT / COMPUTED HELPERS
// ============================================

/**
 * Checks if an effect() call has allowed escape hatches ({ injector } or { manualCleanup: true }).
 */
export function isAllowedEffectCall(callExprRaw: AstNode | null | undefined): boolean {
    const callExpr = unwrapNode(callExprRaw);
    if (!callExpr || callExpr.type !== 'CallExpression') return false;

    const args = callExpr.arguments;
    if (!Array.isArray(args) || args.length < 2) return false;

    const options = unwrapNode(args[1]);
    if (!options || options.type !== 'ObjectExpression') return false;

    const injectorProp = getObjectProperty(options, 'injector');
    if (injectorProp && !isLiteralNullOrUndefined(injectorProp.value as AstNode)) return true;

    const manualCleanupProp = getObjectProperty(options, 'manualCleanup');
    if (manualCleanupProp && isLiteralTrue(manualCleanupProp.value as AstNode)) return true;

    return false;
}

/**
 * Finds all effect() calls in a subtree that are not allowed by escape hatches.
 */
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

/**
 * Gets the callback argument (first arg) from a computed() or effect() call,
 * if it's an arrow or function expression.
 */
export function getCallbackArg(callExpr: AstNode | null | undefined): AstNode | null {
    const args = callExpr?.arguments;
    if (!Array.isArray(args) || args.length === 0) return null;

    const cb = unwrapNode(args[0]);
    if (!cb) return null;

    if (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression') return cb;
    return null;
}

/**
 * Gets the body of a function expression.
 */
export function getFunctionBody(fn: AstNode | null | undefined): AstNode | null {
    if (!fn) return null;
    const body = fn.body;
    return body ? unwrapNode(body as AstNode) : null;
}

// ============================================
// IMPORT ALIAS COLLECTION
// ============================================

/**
 * Collects import aliases for a given exported name from rxjs imports.
 * E.g., `import { BehaviorSubject as BS } from 'rxjs'` -> Set(['BehaviorSubject', 'BS'])
 */
export function collectRxjsAliases(sourceText: string | undefined, exportedName: string): Set<string> {
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
            const parts = inside.split(',').map((s) => s.trim()).filter(Boolean);

            for (const part of parts) {
                const m = new RegExp(`^${exportedName}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`).exec(part);
                if (!m) continue;
                names.add(m[1] ?? exportedName);
            }
        }
    }

    return names;
}

// ============================================
// BATCH RXJS IMPORT ALIAS COLLECTION
// ============================================

/**
 * Batch version of collectRxjsAliases — scans source text ONCE for all requested export names.
 *
 * Use this instead of calling collectRxjsAliases() per name to avoid redundant regex work.
 *
 * @performance O(S × 2) instead of O(S × 2 × N) where N = number of requested names.
 *   Reduces 6 full-source regex sweeps (e.g. for Subject/ReplaySubject/AsyncSubject) down to 2.
 */
export function collectAllRxjsAliases(
    sourceText: string | undefined,
    exportedNames: ReadonlySet<string>
): Map<string, Set<string>> {
    // Seed each entry with its own canonical name so callers always get at least the base name
    const result = new Map<string, Set<string>>(
        [...exportedNames].map(name => [name, new Set([name])])
    );

    if (typeof sourceText !== 'string' || sourceText.length === 0) return result;

    // Pre-compile per-name alias detection patterns to avoid regex construction inside the loop
    const aliasPatternsByName = new Map<string, RegExp>(
        [...exportedNames].map(name => [
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
            const specifiers = (importMatch[1] ?? '').split(',')
                .map(s => s.trim())
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

// ============================================
// RXJS TEARDOWN OPERATOR DETECTION
// ============================================

/**
 * The canonical set of RxJS operators that properly scope subscription lifetime.
 *
 * Shared between rxjs-no-subscribe-in-component and rxjs-require-takeUntilDestroyed rules
 * to guarantee consistent teardown detection without duplicating the operator list.
 */
export const VALID_TEARDOWN_OPERATORS = new Set([
    'takeUntilDestroyed', 'takeUntil', 'take', 'first', 'takeWhile',
]);

/**
 * Extracts the operator name from a single pipe() argument node.
 */
export function getOperatorNameFromPipeArg(arg: AstNode | null | undefined): string {
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

/**
 * Returns true if the given pipe() call contains at least one valid teardown operator.
 */
export function hasTeardownInPipeCall(pipeCall: AstNode): boolean {
    const args = pipeCall.arguments;
    if (!Array.isArray(args)) return false;

    for (const arg of args) {
        if (VALID_TEARDOWN_OPERATORS.has(getOperatorNameFromPipeArg(arg))) return true;
    }
    return false;
}

/**
 * Walks the receiver chain of a .subscribe() call looking for a .pipe() call that
 * contains at least one valid teardown operator.
 *
 * @example `source$.pipe(takeUntilDestroyed(destroyRef)).subscribe(...)` → true
 */
export function hasTeardownInReceiverChain(receiverExpr: AstNode | null | undefined): boolean {
    let current = receiverExpr;

    while (current) {
        const node = unwrapNode(current);
        if (!node || node.type !== 'CallExpression') break;

        const callee = unwrapNode(node.callee);
        if (!isMemberExpressionLike(callee)) break;

        if (getStaticPropertyName(callee) === 'pipe' && hasTeardownInPipeCall(node)) return true;

        current = callee?.object;
    }

    return false;
}

// ============================================
// TEMPLATE HELPERS
// ============================================

/**
 * Computes absolute offset for template expressions, accounting for inline template offset.
 */
export function getTemplateAbsoluteOffset(
    context: { template?: { templateStartOffset?: number } },
    nodeStart: number
): number {
    const templateStartOffset = ((context as any).template as any)?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return nodeStart + (templateStartOffset as number);
    }
    return nodeStart;
}

// ============================================
// PARAMETER HELPERS (for prefer-inject)
// ============================================

/**
 * Gets parameters array from a function node, handling various AST formats.
 */
export function getParamsArray(funcNode: AstNode | null | undefined): AstNode[] {
    if (!funcNode) return [];
    const params = funcNode.params;
    if (Array.isArray(params)) return params;
    if (params && typeof params === 'object') {
        if ('items' in params && Array.isArray((params as { items?: unknown }).items)) return (params as { items: AstNode[] }).items;
        if ('elements' in params && Array.isArray((params as { elements?: unknown }).elements)) return (params as { elements: AstNode[] }).elements;
    }
    return [];
}

/**
 * Gets the identifier name from a parameter node (handles AssignmentPattern, RestElement).
 */
export function getParamIdentifierName(param: AstNode | null | undefined): string {
    const p = unwrapNode(param);
    if (!p) return '';

    if (p.type === 'Identifier') return (p.name as string) ?? '';

    if (p.type === 'AssignmentPattern') {
        const left = unwrapNode(p.left);
        return left?.type === 'Identifier' ? (left.name as string) ?? '' : '';
    }

    if (p.type === 'RestElement') {
        const arg = unwrapNode(p.argument);
        return arg?.type === 'Identifier' ? (arg.name as string) ?? '' : '';
    }

    return '';
}

/**
 * Gets the type name from a parameter's type annotation.
 */
export function getParamTypeName(param: AstNode | null | undefined): string {
    const p = unwrapNode(param);
    if (!p) return '';
    const typeAnnotation = p.typeAnnotation as AstNode | undefined;
    const typeNode = (typeAnnotation?.typeAnnotation ?? typeAnnotation) as AstNode | undefined;
    const t = unwrapNode(typeNode);
    if (!t) return '';

    if (t.type === 'TSTypeReference' || t.type === 'TypeReference') {
        const typeName = t.typeName ?? t.name;
        if (typeName && typeof typeName === 'object') {
            const tn = typeName as AstNode;
            if (tn.type === 'Identifier') return (tn.name as string) ?? '';
            if (tn.type === 'TSQualifiedName') return ((tn.right as AstNode)?.name as string) ?? '';
        }
        if (typeof typeName === 'string') return typeName;
    }

    return '';
}

// ============================================
// TYPECHECKER HELPERS (TypeScript Integration)
// ============================================

/**
 * Lazy singleton for the TypeScript module.
 *
 * TypeScript is an optional peer dependency. Calling require() inside every
 * hot-path function causes repeated module-resolution overhead. This wrapper
 * resolves the module once per process and falls back gracefully when TypeScript
 * is unavailable, so rules degrade to heuristics without throwing.
 */
let _tsModule: typeof import('typescript') | undefined;
let _tsModuleLoaded = false;

function requireTypescript(): typeof import('typescript') | undefined {
    if (!_tsModuleLoaded) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            _tsModule = require('typescript') as typeof import('typescript');
        } catch {
            // TypeScript is optional — rules fall back to AST heuristics
        }
        _tsModuleLoaded = true;
    }
    return _tsModule;
}

/**
 * Maps an Oxc AST node to a TypeScript AST node and fetches its symbol from the TypeChecker.
 * Uses position-based lookup since Oxc and TS nodes do not share identity.
 */
export function getTsSymbolAtNode(
    oxcNode: AstNode | null | undefined,
    context: RuleContext
): import('typescript').Symbol | undefined {
    if (!oxcNode || !context.typeChecker) return undefined;

    const ts = requireTypescript();
    if (!ts) return undefined;

    try {
        // Lazy-create a TS SourceFile from file content if not already present
        if (!context.sourceFile && context.fileContent) {
            (context as any).sourceFile = ts.createSourceFile(
                context.filePath,
                context.fileContent,
                ts.ScriptTarget.Latest,
                true
            );
        }

        const sourceFile = context.sourceFile as import('typescript').SourceFile;
        if (!sourceFile) return undefined;

        const tsNode = findTsNodeAtPosition(sourceFile, getNodeStart(oxcNode), ts);
        if (!tsNode) return undefined;

        // getSymbolAtLocation requires a fully-bound program; attempt gracefully
        return context.typeChecker.getSymbolAtLocation(tsNode);
    } catch {
        return undefined;
    }
}

/**
 * Injectable type suffixes shared between isLikelyAngularInjectableSymbol (TypeChecker path)
 * and the prefer-inject rule's heuristic fallback. Centralised here to prevent drift.
 *
 * NOTE: The prefer-inject rule exports its own extended DIISH_TYPE_SUFFIXES array which
 * is a superset of this list. Keep additions in sync when expanding either.
 */
const INJECTABLE_SYMBOL_SUFFIXES: readonly string[] = [
    'Service', 'Facade', 'Store', 'Client', 'Repository', 'Adapter',
    'Controller', 'Provider', 'Registry', 'Logger', 'Router', 'Injector',
    'Handler', 'Interceptor', 'Guard', 'Resolver', 'Validator',
];

/**
 * Checks if a symbol belongs to a well-known Angular type or carries an @Injectable decorator.
 */
export function isLikelyAngularInjectableSymbol(
    symbol: import('typescript').Symbol | undefined
): boolean {
    if (!symbol) return false;

    const ts = requireTypescript();
    if (!ts) return false;

    try {
        // Heuristic fast-path: injectable suffix in the symbol name
        const name = symbol.getName();
        if (INJECTABLE_SYMBOL_SUFFIXES.some(suffix => name.endsWith(suffix))) return true;

        // Structural check: look for an @Injectable decorator on the declaration
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

/**
 * Iteratively finds the innermost TypeScript AST node that contains a given source position.
 *
 * Replaces the recursive version to eliminate:
 *   - Unbounded call-stack depth on large TS files (overflow risk).
 *   - Per-invocation require('typescript') calls (now resolved once via requireTypescript()).
 *
 * Walks downward from root: at each level, forEachChild finds the single child whose
 * span contains `pos`. This is O(D) where D = depth to the target node, not O(N).
 *
 * @param ts - Pre-resolved TypeScript module (passed to avoid repeated require() calls)
 */
function findTsNodeAtPosition(
    root: import('typescript').Node,
    pos: number,
    ts: typeof import('typescript')
): import('typescript').Node | undefined {
    if (pos < root.getStart() || pos >= root.getEnd()) return undefined;

    let current: import('typescript').Node = root;

    // Walk down to the innermost child that contains pos.
    // forEachChild returns a truthy value when its callback returns truthy, allowing early exit.
    while (true) {
        const child = ts.forEachChild(current, (c) => {
            if (pos >= c.getStart() && pos < c.getEnd()) return c;
            return undefined;
        });

        if (!child) break;   // No child spans this position — current is the innermost node
        current = child;
    }

    return current;
}
