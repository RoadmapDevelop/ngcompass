import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { AstNode, unwrapNode, getClassBody, getConstructorMember, getNodeStart, getParamIdentifierName, getParamTypeName, getParamsArray, getTsSymbolAtNode, isLikelyAngularInjectableSymbol } from '../../rule-utils';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

const RULE_NAME = 'prefer-inject-over-constructor-di';

const DIISH_NAMES = new Set(['http', 'router', 'route', 'cdr', 'cdref', 'changedetectorref', 'injector', 'ngzone', 'zone', 'renderer', 'renderer2', 'elementref', 'el', 'document', 'platform', 'location', 'dialog', 'snack', 'toast', 'store', 'facade', 'logger', 'translate', 'i18n', 'auth', 'api', 'client', 'matdialog', 'overlay', 'breakpointobserver', 'snackbar', 'matsnackbar', 'bottomsheet', 'matbottomsheet', 'clipboard', 'directionality', 'focusmonitor', 'mediamatcher', 'viewportruler', 'scrolldispatcher', 'dragdrop', 'liveannouncer', 'activatedroute', 'fb', 'firestore', 'angularfire', 'formbuilder', 'titleservice', 'metaservice', 'title', 'meta', 'sanitizer', 'domsanitizer', 'compiler', 'applicationref', 'componentfactoryresolver', 'viewcontainerref', 'templateref', 'destroyref']);
const NON_DIISH_NAMES = new Set(['data', 'config', 'options', 'opts', 'params', 'payload', 'input', 'value', 'values', 'items', 'item', 'context', 'ctx', 'model', 'vm', 'state', 'initialstate', 'result', 'name', 'id', 'label', 'text', 'title', 'message', 'url', 'path', 'index', 'count', 'size', 'length', 'width', 'height', 'color', 'type', 'key', 'mode', 'flag', 'enabled', 'disabled', 'visible', 'hidden']);
const DIISH_SUFFIXES = ['Service', 'Facade', 'Store', 'Client', 'Repository', 'Adapter', 'Manager', 'Controller', 'Provider', 'Registry', 'Logger', 'Router', 'ActivatedRoute', 'ChangeDetectorRef', 'DestroyRef', 'Injector', 'NgZone', 'Renderer2', 'ElementRef', 'HttpClient', 'ViewContainerRef', 'TemplateRef', 'ComponentFactoryResolver', 'ApplicationRef', 'MatDialog', 'MatDialogRef', 'MatSnackBar', 'MatBottomSheet', 'Overlay', 'OverlayRef', 'BreakpointObserver', 'Clipboard', 'FocusMonitor', 'MediaMatcher', 'ScrollDispatcher', 'DragDrop', 'LiveAnnouncer', 'Directionality', 'ViewportRuler', 'FormBuilder', 'DomSanitizer', 'Title', 'Meta', 'Dispatcher', 'Gateway', 'Handler', 'Interceptor', 'Guard', 'Resolver', 'Factory', 'Strategy', 'Validator'];
const PRIMITIVES = new Set(['string', 'number', 'boolean', 'symbol', 'bigint', 'any', 'unknown', 'void']);

function isLikelyDi(param: AstNode, context: RuleContext): boolean {
    const node = unwrapNode(param);
    if (!node) return false;

    if (Array.isArray(node.decorators) && node.decorators.length > 0) return true;
    if (node.accessibility || node.readonly) return true;
    if (context.typeChecker) {
        const symbol = getTsSymbolAtNode(param, context);
        if (symbol && isLikelyAngularInjectableSymbol(symbol)) return true;
    }

    const name = (getParamIdentifierName(param) || '').toLowerCase().trim();
    if (!name || NON_DIISH_NAMES.has(name)) return false;
    if (DIISH_NAMES.has(name)) return true;

    const type = (getParamTypeName(param) || '').trim();
    if (!type || PRIMITIVES.has(type.toLowerCase())) return false;
    return DIISH_SUFFIXES.some(s => type.endsWith(s));
}

export const preferInjectRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const classBody = getClassBody(classNodeWrapper.node as AstNode);
        const ctor = getConstructorMember(classBody);
        if (!ctor) return null;

        const params = getParamsArray((ctor.value ?? ctor) as AstNode);
        const diParams = params.filter(p => isLikelyDi(p, context));
        if (diParams.length === 0) return null;

        const { line, column } = context.locator.location(getNodeStart(ctor));
        const offenders = diParams.map(p => `${getParamIdentifierName(p)}: ${getParamTypeName(p)}`).join(', ');

        return {
            filePath: context.filePath,
            ruleName: RULE_NAME,
            message: `Constructor dependency injection makes class setup less composable than inject().${offenders ? ` Offending params: ${offenders}.` : ''}`,
            line,
            column,
            severity: 'warn',
            fix: RECOMMENDATIONS[RULE_NAME],
            codeExample: CODE_EXAMPLES[RULE_NAME],
        };
    },
    { requires: { typeChecker: true } }
);
