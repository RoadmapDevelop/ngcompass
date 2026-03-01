import { CODE_EXAMPLES, RECOMMENDATIONS } from '../recommendations';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { AstNode, unwrapNode, getTsSymbolAtNode, isLikelyAngularInjectableSymbol, getParamIdentifierName, getParamTypeName, getClassBody, getConstructorMember, getParamsArray, getNodeStart } from '../rule-utils';
import { RuleContext, RuleFailure } from '@ngcompass/common';

const DIISH_PARAM_NAMES = new Set([
    'http', 'router', 'route', 'cdr', 'cdref', 'changedetectorref',
    'injector', 'ngzone', 'zone', 'renderer', 'renderer2', 'elementref',
    'el', 'document', 'platform', 'location', 'dialog', 'snack', 'toast',
    'store', 'facade', 'logger', 'translate', 'i18n', 'auth', 'api', 'client',
    'matdialog', 'overlay', 'breakpointobserver', 'snackbar', 'matsnackbar',
    'bottomsheet', 'matbottomsheet', 'clipboard', 'directionality',
    'focusmonitor', 'mediamatcher', 'viewportruler', 'scrolldispatcher',
    'dragdrop', 'liveannouncer', 'activatedroute',
    'fb', 'firestore', 'angularfire', 'formbuilder', 'titleservice',
    'metaservice', 'title', 'meta', 'sanitizer', 'domsanitizer',
    'compiler', 'applicationref', 'componentfactoryresolver',
    'viewcontainerref', 'templateref', 'destroyref',
]);

const NON_DIISH_PARAM_NAMES = new Set([
    'data', 'config', 'options', 'opts', 'params', 'payload',
    'input', 'value', 'values', 'items', 'item', 'context', 'ctx',
    'model', 'vm', 'state', 'initialstate', 'result', 'name', 'id',
    'label', 'text', 'title', 'message', 'url', 'path', 'index',
    'count', 'size', 'length', 'width', 'height', 'color', 'type',
    'key', 'mode', 'flag', 'enabled', 'disabled', 'visible', 'hidden',
]);

/**
 * Type name suffixes that strongly indicate Angular DI injection.
 * Sorted roughly by frequency for marginal early-exit benefit in the endsWith loop.
 *
 * NOTE: INJECTABLE_SYMBOL_SUFFIXES in rule-utils.ts is a subset of this list.
 * Keep both in sync when adding entries.
 */
export const DIISH_TYPE_SUFFIXES = [
    'Service', 'Facade', 'Store', 'Client', 'Repository', 'Adapter',
    'Manager', 'Controller', 'Provider', 'Registry', 'Logger', 'Router',
    'ActivatedRoute', 'ChangeDetectorRef', 'DestroyRef', 'Injector',
    'NgZone', 'Renderer2', 'ElementRef', 'HttpClient', 'ViewContainerRef',
    'TemplateRef', 'ComponentFactoryResolver', 'ApplicationRef',
    'MatDialog', 'MatDialogRef', 'MatSnackBar', 'MatBottomSheet',
    'Overlay', 'OverlayRef', 'BreakpointObserver', 'Clipboard',
    'FocusMonitor', 'MediaMatcher', 'ScrollDispatcher', 'DragDrop',
    'LiveAnnouncer', 'Directionality', 'ViewportRuler',
    'FormBuilder', 'DomSanitizer', 'Title', 'Meta',
    'Dispatcher', 'Gateway', 'Handler', 'Interceptor', 'Guard',
    'Resolver', 'Factory', 'Strategy', 'Validator',
] as const;

function lower(s: string): string {
    return s.toLowerCase();
}

function hasParamDecorators(param: AstNode): boolean {
    const p = unwrapNode(param);
    const decs = p?.decorators;
    return Array.isArray(decs) && decs.length > 0;
}

function hasParamPropertyModifier(param: AstNode): boolean {
    const p = unwrapNode(param);
    return Boolean(p?.accessibility) || Boolean(p?.readonly);
}

function isPrimitiveTypeName(typeName: string): boolean {
    const t = lower(typeName);
    return t === 'string' || t === 'number' || t === 'boolean' || t === 'symbol' || t === 'bigint' || t === 'any' || t === 'unknown' || t === 'void';
}

/**
 * Returns true when the type name ends with a known Angular DI suffix.
 *
 * The redundant Array.includes() guard was removed: endsWith() already handles
 * exact matches (e.g. 'Service'.endsWith('Service') === true), so the extra
 * O(N) includes() scan added cost without shortening the happy path.
 */
function isInjectedServiceType(typeName: string): boolean {
    if (!typeName) return false;
    return DIISH_TYPE_SUFFIXES.some(suffix => typeName.endsWith(suffix));
}

function isLikelyDIParam(param: AstNode, context: RuleContext): boolean {
    if (hasParamDecorators(param)) return true;
    if (hasParamPropertyModifier(param)) return true;

    // TypeChecker Integration
    if (context.typeChecker) {
        const symbol = getTsSymbolAtNode(param, context);
        if (symbol && isLikelyAngularInjectableSymbol(symbol)) return true;
    }

    const name = lower(getParamIdentifierName(param));
    const typeName = getParamTypeName(param);

    if (!name && !typeName) return false;

    if (name && DIISH_PARAM_NAMES.has(name)) return true;
    if (name && NON_DIISH_PARAM_NAMES.has(name)) return false;

    if (typeName && !isPrimitiveTypeName(typeName) && isInjectedServiceType(typeName)) return true;

    return false;
}

function paramDisplayName(param: AstNode): string {
    const name = getParamIdentifierName(param);
    const typeName = getParamTypeName(param);
    if (name && typeName) return `${name}: ${typeName}`;
    return name || typeName || '<param>';
}

function getFunctionValueFromConstructor(ctor: AstNode): AstNode | null {
    if (!ctor) return null;
    return (ctor.value ?? ctor) as AstNode;
}

/**
 * Prefer `inject()` over constructor-based dependency injection in Angular classes.
 */
export const preferInjectRule = createAnyAngularClassRule(
    'prefer-inject-over-constructor-di',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const classNode = streamNode.node as any;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const ctor = getConstructorMember(classBody);
        if (!ctor) return null;

        const funcNode = getFunctionValueFromConstructor(ctor);
        if (!funcNode) return null;

        const params = getParamsArray(funcNode);
        if (params.length === 0) return null;

        const diParams = params.filter((p: any) => isLikelyDIParam(p, context));
        if (diParams.length === 0) return null;

        const start = getNodeStart(ctor);
        const { line, column } = context.locator.location(start);

        const listed = diParams.map(paramDisplayName).join(', ');
        const suffix = listed ? ` Offending params: ${listed}.` : '';

        return {
            filePath: context.filePath,
            ruleName: 'prefer-inject-over-constructor-di',
            message: `Use inject() instead of constructor parameters for dependency injection.${suffix}`,
            line,
            column,
            severity: 'moderate',
            fix: RECOMMENDATIONS['prefer-inject-over-constructor-di'],
            codeExample: CODE_EXAMPLES['prefer-inject-over-constructor-di'],
        };
    }
);

