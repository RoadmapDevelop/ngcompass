import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';

import {
    AstNode,
    MaybeAstNode,
    getClassBody,
    getConstructorMember,
    getNodeStart,
    getParamIdentifierName,
    getParamTypeName,
    getParamsArray,
    getTsSymbolAtNode,
    isLikelyAngularInjectableSymbol,
    unwrapNode,
} from '../../rule-utils';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

const RULE_NAME = 'prefer-inject-over-constructor-di';

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
 * Type suffixes that strongly suggest DI-oriented dependencies.
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

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Returns the constructor node from the class body.
 */
function getConstructorNode(classNode: AstNode): MaybeAstNode {
    const classBody = getClassBody(classNode);
    if (classBody.length === 0) {
        return null;
    }

    return getConstructorMember(classBody);
}

/**
 * Returns constructor parameters for the given class.
 */
function getConstructorParams(classNode: AstNode): AstNode[] {
    const ctor = getConstructorNode(classNode);
    if (!ctor) {
        return [];
    }

    const ctorValue = (ctor.value ?? ctor) as AstNode;
    return getParamsArray(ctorValue);
}

/**
 * Returns true when the parameter has Angular/TS parameter decorators.
 */
function hasParamDecorators(param: AstNode): boolean {
    const node = unwrapNode(param);
    const decorators = node?.decorators;
    return Array.isArray(decorators) && decorators.length > 0;
}

/**
 * Returns true when the parameter is declared as a constructor parameter property.
 */
function hasParamPropertyModifier(param: AstNode): boolean {
    const node = unwrapNode(param);
    return Boolean(node?.accessibility) || Boolean(node?.readonly);
}

/**
 * Returns true when the parameter resolves to an injectable symbol via TypeChecker.
 */
function hasInjectableTypeSymbol(param: AstNode, context: RuleContext): boolean {
    if (!context.typeChecker) {
        return false;
    }

    const symbol = getTsSymbolAtNode(param, context);
    return Boolean(symbol && isLikelyAngularInjectableSymbol(symbol));
}

/**
 * Returns the normalized identifier name for the parameter.
 */
function getNormalizedParamName(param: AstNode): string {
    return normalize(getParamIdentifierName(param));
}

/**
 * Returns the raw declared type name for the parameter.
 */
function getDeclaredParamTypeName(param: AstNode): string {
    return getParamTypeName(param).trim();
}

/**
 * Returns true when the type is primitive-ish and should not be treated as DI.
 */
function isPrimitiveTypeName(typeName: string): boolean {
    switch (normalize(typeName)) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'symbol':
        case 'bigint':
        case 'any':
        case 'unknown':
        case 'void':
            return true;
        default:
            return false;
    }
}

/**
 * Returns true when the type name ends with a DI-ish suffix.
 */
function hasDiishTypeSuffix(typeName: string): boolean {
    if (!typeName) {
        return false;
    }

    return DIISH_TYPE_SUFFIXES.some(suffix => typeName.endsWith(suffix));
}

/**
 * Returns true when the parameter name is a strong DI heuristic.
 */
function hasDiishParamName(param: AstNode): boolean {
    const name = getNormalizedParamName(param);
    return Boolean(name) && DIISH_PARAM_NAMES.has(name);
}

/**
 * Returns true when the parameter name strongly suggests non-DI data.
 */
function hasNonDiishParamName(param: AstNode): boolean {
    const name = getNormalizedParamName(param);
    return Boolean(name) && NON_DIISH_PARAM_NAMES.has(name);
}

/**
 * Returns true when the parameter type heuristically looks like an injected dependency.
 */
function hasDiishTypeName(param: AstNode): boolean {
    const typeName = getDeclaredParamTypeName(param);
    if (!typeName || isPrimitiveTypeName(typeName)) {
        return false;
    }

    return hasDiishTypeSuffix(typeName);
}

/**
 * Returns true when the parameter has strong semantic DI evidence.
 */
function hasStrongDiEvidence(param: AstNode, context: RuleContext): boolean {
    return (
        hasParamDecorators(param) ||
        hasParamPropertyModifier(param) ||
        hasInjectableTypeSymbol(param, context)
    );
}

/**
 * Returns true when the parameter has fallback heuristic DI evidence.
 */
function hasHeuristicDiEvidence(param: AstNode): boolean {
    if (hasNonDiishParamName(param)) {
        return false;
    }

    if (hasDiishParamName(param)) {
        return true;
    }

    return hasDiishTypeName(param);
}

/**
 * Returns true when the constructor parameter likely participates in Angular DI.
 */
function isLikelyConstructorDiParam(param: AstNode, context: RuleContext): boolean {
    if (hasStrongDiEvidence(param, context)) {
        return true;
    }

    return hasHeuristicDiEvidence(param);
}

/**
 * Returns all constructor params that likely represent dependency injection.
 */
function collectConstructorDiParams(classNode: AstNode, context: RuleContext): AstNode[] {
    const params = getConstructorParams(classNode);
    return params.filter(param => isLikelyConstructorDiParam(param, context));
}

/**
 * Builds a readable display label for a constructor parameter.
 */
function formatParam(param: AstNode): string {
    const name = getParamIdentifierName(param);
    const typeName = getParamTypeName(param);

    if (name && typeName) {
        return `${name}: ${typeName}`;
    }

    return name || typeName || '<param>';
}

/**
 * Builds the failure message.
 */
function buildFailureMessage(diParams: AstNode[]): string {
    const listed = diParams.map(formatParam).join(', ');
    const suffix = listed ? ` Offending params: ${listed}.` : '';

    return `Prefer inject() over constructor-based dependency injection.${suffix}`;
}

/**
 * Creates the rule failure for constructor-based DI.
 */
function createFailure(
    ctor: AstNode,
    context: RuleContext,
    diParams: AstNode[],
): RuleFailure {
    const start = getNodeStart(ctor);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(diParams),
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Prefer `inject()` over constructor-based dependency injection in Angular classes.
 */
export const preferInjectRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const classNode = classNodeWrapper.node as AstNode;

        const ctor = getConstructorNode(classNode);
        if (!ctor) {
            return null;
        }

        const diParams = collectConstructorDiParams(classNode, context);
        if (diParams.length === 0) {
            return null;
        }

        return createFailure(ctor as AstNode, context, diParams);
    },
);