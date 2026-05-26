import { describe, it, expect } from 'vitest';
import {
  unwrapNode,
  isMemberExpressionLike,
  getStaticPropertyName,
  getNodeStart,
  isCalleeNamed,
  getCalleeName,
  isSubscribeCall,
  getObjectProperty,
  isLiteralTrue,
  isLiteralNullOrUndefined,
  childNodes,
  isConstructorMethod,
  isMethodDefinition,
  getConstructorMember,
  getMethodBody,
  getMethodName,
  getClassBody,
  isAllowedEffectCall,
  findEffectCalls,
  getCallbackArg,
  getFunctionBody,
  collectRxjsAliases,
  collectAllRxjsAliases,
  hasTeardownInPipeCall,
  hasTeardownInReceiverChain,
  getOperatorNameFromPipeArg,
  getTemplateAbsoluteOffset,
  findObservableSourceCall,
  isLikelyHttpObservable,
  getParamsArray,
  getParamIdentifierName,
  getParamTypeName,
  VALID_TEARDOWN_OPERATORS,
  type AstNode,
} from '../src/rule-utils.js';

function n(type: string, extra: Partial<AstNode> = {}): AstNode {
  return { type, ...extra };
}

function identifier(name: string): AstNode {
  return n('Identifier', { name });
}

function literal(value: unknown): AstNode {
  return n('Literal', { value });
}

function callExpr(callee: AstNode, args: AstNode[] = []): AstNode {
  return n('CallExpression', { callee, arguments: args });
}

function memberExpr(
  object: AstNode,
  property: AstNode,
  computed = false
): AstNode {
  return n('StaticMemberExpression', { object, property, computed });
}

describe('unwrapNode', () => {
  it('returns null for null/undefined input', () => {
    expect(unwrapNode(null)).toBeNull();
    expect(unwrapNode(undefined)).toBeNull();
  });

  it('returns the node unchanged when it is not a wrapper type', () => {
    const node = identifier('foo');
    expect(unwrapNode(node)).toBe(node);
  });

  it('unwraps TSNonNullExpression', () => {
    const inner = identifier('x');
    const wrapper = n('TSNonNullExpression', { expression: inner });
    expect(unwrapNode(wrapper)).toBe(inner);
  });

  it('unwraps TSAsExpression', () => {
    const inner = identifier('x');
    expect(unwrapNode(n('TSAsExpression', { expression: inner }))).toBe(inner);
  });

  it('unwraps ParenthesizedExpression', () => {
    const inner = identifier('x');
    expect(
      unwrapNode(n('ParenthesizedExpression', { expression: inner }))
    ).toBe(inner);
  });

  it('unwraps ChainExpression', () => {
    const inner = identifier('x');
    expect(unwrapNode(n('ChainExpression', { expression: inner }))).toBe(inner);
  });

  it('unwraps multiple layers', () => {
    const inner = identifier('x');
    const mid = n('TSAsExpression', { expression: inner });
    const outer = n('ParenthesizedExpression', { expression: mid });
    expect(unwrapNode(outer)).toBe(inner);
  });
});

describe('isMemberExpressionLike', () => {
  it.each([
    'MemberExpression',
    'StaticMemberExpression',
    'OptionalMemberExpression',
  ])('returns true for %s', (type) =>
    expect(isMemberExpressionLike(n(type))).toBe(true)
  );

  it('returns false for Identifier', () => {
    expect(isMemberExpressionLike(identifier('foo'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isMemberExpressionLike(null)).toBe(false);
    expect(isMemberExpressionLike(undefined)).toBe(false);
  });
});

describe('getStaticPropertyName', () => {
  it('returns the property name for a static member expression', () => {
    const expr = memberExpr(identifier('obj'), identifier('prop'));
    expect(getStaticPropertyName(expr)).toBe('prop');
  });

  it('returns the string value for a computed string literal', () => {
    const expr = n('MemberExpression', {
      property: literal('key'),
      computed: true,
    });
    expect(getStaticPropertyName(expr)).toBe('key');
  });

  it('returns empty string for a computed non-literal property', () => {
    const expr = n('MemberExpression', {
      property: identifier('dynamic'),
      computed: true,
    });
    expect(getStaticPropertyName(expr)).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(getStaticPropertyName(null)).toBe('');
  });
});

describe('getNodeStart', () => {
  it('returns node.start when available', () => {
    expect(getNodeStart(n('Identifier', { start: 42 }))).toBe(42);
  });

  it('returns node.span.start when start is absent', () => {
    const node: AstNode = { type: 'Identifier', span: { start: 10, end: 20 } };
    expect(getNodeStart(node)).toBe(10);
  });

  it('returns 0 for null/undefined', () => {
    expect(getNodeStart(null)).toBe(0);
    expect(getNodeStart(undefined)).toBe(0);
  });
});

describe('isCalleeNamed', () => {
  it('matches a direct Identifier callee', () => {
    expect(isCalleeNamed(identifier('effect'), 'effect')).toBe(true);
  });

  it('matches a member expression callee', () => {
    const callee = memberExpr(identifier('obj'), identifier('subscribe'));
    expect(isCalleeNamed(callee, 'subscribe')).toBe(true);
  });

  it('returns false when name does not match', () => {
    expect(isCalleeNamed(identifier('effect'), 'computed')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isCalleeNamed(null, 'effect')).toBe(false);
  });
});

describe('getCalleeName', () => {
  it('returns the identifier name for a direct call', () => {
    const call = callExpr(identifier('effect'));
    expect(getCalleeName(call)).toBe('effect');
  });

  it('returns the method name for a member call', () => {
    const callee = memberExpr(identifier('obj'), identifier('subscribe'));
    const call = callExpr(callee);
    expect(getCalleeName(call)).toBe('subscribe');
  });

  it('returns empty string for non-call-expression input', () => {
    expect(getCalleeName(identifier('foo'))).toBe('');
  });

  it('returns empty string for null', () => {
    expect(getCalleeName(null)).toBe('');
  });
});

describe('isSubscribeCall', () => {
  it('returns true for obj.subscribe(...) call', () => {
    const callee = memberExpr(identifier('src$'), identifier('subscribe'));
    const call = callExpr(callee);
    expect(isSubscribeCall(call)).toBe(true);
  });

  it('returns false for a direct subscribe() call (no receiver)', () => {
    const call = callExpr(identifier('subscribe'));
    expect(isSubscribeCall(call)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSubscribeCall(null)).toBe(false);
  });
});

describe('getObjectProperty', () => {
  function objExpr(props: Array<{ key: string; value: AstNode }>): AstNode {
    return n('ObjectExpression', {
      properties: props.map(({ key, value }) =>
        n('Property', { key: identifier(key), value })
      ),
    });
  }

  it('returns the matching property node', () => {
    const obj = objExpr([{ key: 'injector', value: identifier('ref') }]);
    const prop = getObjectProperty(obj, 'injector');
    expect(prop).not.toBeNull();
  });

  it('returns null when property does not exist', () => {
    const obj = objExpr([{ key: 'other', value: identifier('x') }]);
    expect(getObjectProperty(obj, 'missing')).toBeNull();
  });

  it('returns null for non-ObjectExpression nodes', () => {
    expect(getObjectProperty(identifier('x'), 'key')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(getObjectProperty(null, 'key')).toBeNull();
  });
});

describe('isLiteralTrue', () => {
  it('returns true for Literal true', () => {
    expect(isLiteralTrue(literal(true))).toBe(true);
  });

  it('returns false for Literal false', () => {
    expect(isLiteralTrue(literal(false))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isLiteralTrue(null)).toBe(false);
  });
});

describe('isLiteralNullOrUndefined', () => {
  it('returns true for Literal null', () => {
    expect(isLiteralNullOrUndefined(literal(null))).toBe(true);
  });

  it('returns true for Identifier "undefined"', () => {
    expect(isLiteralNullOrUndefined(identifier('undefined'))).toBe(true);
  });

  it('returns false for Identifier "something"', () => {
    expect(isLiteralNullOrUndefined(identifier('something'))).toBe(false);
  });

  it('returns true for null/undefined input (falsy → treated as null/undefined)', () => {
    expect(isLiteralNullOrUndefined(null)).toBe(true);
    expect(isLiteralNullOrUndefined(undefined)).toBe(true);
  });
});

describe('childNodes', () => {
  it('yields nothing for null', () => {
    expect([...childNodes(null)]).toHaveLength(0);
  });

  it('yields nothing for a primitive', () => {
    expect([...childNodes(42 as any)]).toHaveLength(0);
  });

  it('yields object children from a node', () => {
    const child = identifier('x');
    const parent = n('ExpressionStatement', { expression: child });
    expect([...childNodes(parent)]).toContain(child);
  });

  it('yields all elements when the node is an array', () => {
    const a = identifier('a');
    const b = identifier('b');
    const arr = [a, b] as unknown as AstNode;
    const result = [...childNodes(arr)];
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  it('does not yield skip-keys (parent, span, loc, start, end, type)', () => {
    const spanNode = { start: 0, end: 10 };
    const node: AstNode = {
      type: 'X',
      start: 0,
      end: 10,
      span: { start: 0, end: 10 },
      body: identifier('inner'),
    };
    const children = [...childNodes(node)];

    expect(children.some((c: any) => c === spanNode)).toBe(false);
    expect(children.some((c: any) => c.name === 'inner')).toBe(true);
  });

  it('yields elements from array-valued properties', () => {
    const a = identifier('a');
    const b = identifier('b');
    const node = n('Program', { body: [a, b] });
    const children = [...childNodes(node)];
    expect(children).toContain(a);
    expect(children).toContain(b);
  });
});

describe('isConstructorMethod', () => {
  it('returns true when kind === "constructor"', () => {
    expect(
      isConstructorMethod(n('MethodDefinition', { kind: 'constructor' }))
    ).toBe(true);
  });

  it('returns true when key is Identifier named "constructor"', () => {
    expect(
      isConstructorMethod(
        n('MethodDefinition', { key: identifier('constructor') })
      )
    ).toBe(true);
  });

  it('returns false for a regular method', () => {
    expect(
      isConstructorMethod(
        n('MethodDefinition', { key: identifier('ngOnInit') })
      )
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isConstructorMethod(null)).toBe(false);
  });
});

describe('isMethodDefinition', () => {
  it.each(['MethodDefinition', 'TSAbstractMethodDefinition', 'ClassMethod'])(
    'returns true for %s',
    (type) => expect(isMethodDefinition(n(type))).toBe(true)
  );

  it('returns false for PropertyDefinition', () => {
    expect(isMethodDefinition(n('PropertyDefinition'))).toBe(false);
  });
});

describe('getConstructorMember', () => {
  it('returns the constructor method from a class body', () => {
    const ctor = n('MethodDefinition', {
      kind: 'constructor',
      key: identifier('constructor'),
    });
    const other = n('MethodDefinition', { key: identifier('ngOnInit') });
    expect(getConstructorMember([ctor, other])).toBe(ctor);
  });

  it('returns null when there is no constructor', () => {
    const m = n('MethodDefinition', { key: identifier('ngOnInit') });
    expect(getConstructorMember([m])).toBeNull();
  });
});

describe('getMethodBody', () => {
  it('returns the body of a method definition', () => {
    const body = n('BlockStatement');
    const def = n('MethodDefinition', {
      value: n('FunctionExpression', { body }),
    });
    expect(getMethodBody(def)).toBe(body);
  });

  it('returns null for null input', () => {
    expect(getMethodBody(null)).toBeNull();
  });
});

describe('getMethodName', () => {
  it('returns the name for an Identifier key', () => {
    expect(
      getMethodName(n('MethodDefinition', { key: identifier('myMethod') }))
    ).toBe('myMethod');
  });

  it('returns the string literal value for a Literal key', () => {
    expect(
      getMethodName(n('MethodDefinition', { key: literal('literalMethod') }))
    ).toBe('literalMethod');
  });

  it('returns "<method>" for null/missing key', () => {
    expect(getMethodName(n('MethodDefinition'))).toBe('<method>');
    expect(getMethodName(null)).toBe('<method>');
  });
});

describe('getClassBody', () => {
  it('returns the body array directly', () => {
    const body = [identifier('a')];
    expect(getClassBody(n('ClassDeclaration', { body }))).toBe(body);
  });

  it('returns the nested .body.body array', () => {
    const inner = [identifier('b')];
    const classNode = n('ClassDeclaration', { body: { body: inner } as any });
    expect(getClassBody(classNode)).toBe(inner);
  });

  it('returns an empty array for null/missing body', () => {
    expect(getClassBody(null)).toEqual([]);
    expect(getClassBody(n('ClassDeclaration'))).toEqual([]);
  });
});

describe('isAllowedEffectCall', () => {
  it('returns true when options.injector is set to a non-null value', () => {
    const options = n('ObjectExpression', {
      properties: [
        n('Property', {
          key: identifier('injector'),
          value: identifier('destroyRef'),
        }),
      ],
    });
    const call = callExpr(identifier('effect'), [
      n('ArrowFunctionExpression'),
      options,
    ]);
    expect(isAllowedEffectCall(call)).toBe(true);
  });

  it('returns true when options.manualCleanup is true', () => {
    const options = n('ObjectExpression', {
      properties: [
        n('Property', {
          key: identifier('manualCleanup'),
          value: literal(true),
        }),
      ],
    });
    const call = callExpr(identifier('effect'), [
      n('ArrowFunctionExpression'),
      options,
    ]);
    expect(isAllowedEffectCall(call)).toBe(true);
  });

  it('returns false when called with only one argument', () => {
    const call = callExpr(identifier('effect'), [n('ArrowFunctionExpression')]);
    expect(isAllowedEffectCall(call)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAllowedEffectCall(null)).toBe(false);
  });
});

describe('findEffectCalls', () => {
  it('returns an effect() call that is not allowed', () => {
    const effectCall = callExpr(identifier('effect'), [
      n('ArrowFunctionExpression'),
    ]);
    const program = n('Program', {
      body: [n('ExpressionStatement', { expression: effectCall })],
    });
    const found = findEffectCalls(program);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(effectCall);
  });

  it('does not return an allowed effect() call', () => {
    const options = n('ObjectExpression', {
      properties: [
        n('Property', {
          key: identifier('injector'),
          value: identifier('ref'),
        }),
      ],
    });
    const effectCall = callExpr(identifier('effect'), [
      n('ArrowFunctionExpression'),
      options,
    ]);
    const program = n('Program', {
      body: [n('ExpressionStatement', { expression: effectCall })],
    });
    expect(findEffectCalls(program)).toHaveLength(0);
  });

  it('returns empty array for null root', () => {
    expect(findEffectCalls(null)).toHaveLength(0);
  });
});

describe('getCallbackArg', () => {
  it('returns the first ArrowFunctionExpression argument', () => {
    const cb = n('ArrowFunctionExpression');
    const call = callExpr(identifier('effect'), [cb]);
    expect(getCallbackArg(call)).toBe(cb);
  });

  it('returns the first FunctionExpression argument', () => {
    const cb = n('FunctionExpression');
    const call = callExpr(identifier('effect'), [cb]);
    expect(getCallbackArg(call)).toBe(cb);
  });

  it('returns null when the first arg is not a function', () => {
    const call = callExpr(identifier('effect'), [literal(42)]);
    expect(getCallbackArg(call)).toBeNull();
  });

  it('returns null for empty args', () => {
    expect(getCallbackArg(callExpr(identifier('effect')))).toBeNull();
  });
});

describe('collectRxjsAliases', () => {
  it('always includes the canonical name in the result', () => {
    const result = collectRxjsAliases('', 'Subject');
    expect(result.has('Subject')).toBe(true);
  });

  it('collects an aliased import', () => {
    const src = `import { Subject as S } from 'rxjs';`;
    const result = collectRxjsAliases(src, 'Subject');
    expect(result.has('S')).toBe(true);
    expect(result.has('Subject')).toBe(true);
  });

  it('handles sub-path imports (rxjs/operators)', () => {
    const src = `import { takeUntil as TU } from 'rxjs/operators';`;
    const result = collectRxjsAliases(src, 'takeUntil');
    expect(result.has('TU')).toBe(true);
  });

  it('ignores non-rxjs imports', () => {
    const src = `import { Subject as S } from '@angular/core';`;
    const result = collectRxjsAliases(src, 'Subject');
    expect(result.has('S')).toBe(false);
  });

  it('returns a set with only the canonical name for empty source', () => {
    expect(collectRxjsAliases(undefined, 'BehaviorSubject').size).toBe(1);
  });
});

describe('collectAllRxjsAliases', () => {
  it('seeds each entry with its canonical name', () => {
    const names = new Set(['Subject', 'BehaviorSubject']);
    const result = collectAllRxjsAliases('', names);
    expect(result.get('Subject')?.has('Subject')).toBe(true);
    expect(result.get('BehaviorSubject')?.has('BehaviorSubject')).toBe(true);
  });

  it('collects aliases for all requested names in one pass', () => {
    const src = `import { Subject as S, BehaviorSubject as BS } from 'rxjs';`;
    const names = new Set(['Subject', 'BehaviorSubject']);
    const result = collectAllRxjsAliases(src, names);
    expect(result.get('Subject')?.has('S')).toBe(true);
    expect(result.get('BehaviorSubject')?.has('BS')).toBe(true);
  });

  it('handles undefined source text without throwing', () => {
    const names = new Set(['Subject']);
    expect(() => collectAllRxjsAliases(undefined, names)).not.toThrow();
  });
});

describe('VALID_TEARDOWN_OPERATORS', () => {
  it('contains takeUntilDestroyed', () => {
    expect(VALID_TEARDOWN_OPERATORS.has('takeUntilDestroyed')).toBe(true);
  });

  it('contains takeUntil', () => {
    expect(VALID_TEARDOWN_OPERATORS.has('takeUntil')).toBe(true);
  });
});

describe('getOperatorNameFromPipeArg', () => {
  it('returns identifier name for a bare Identifier arg', () => {
    expect(getOperatorNameFromPipeArg(identifier('takeUntilDestroyed'))).toBe(
      'takeUntilDestroyed'
    );
  });

  it('returns callee name for a CallExpression arg', () => {
    const arg = callExpr(identifier('takeUntil'), [identifier('destroy$')]);
    expect(getOperatorNameFromPipeArg(arg)).toBe('takeUntil');
  });

  it('returns empty string for null', () => {
    expect(getOperatorNameFromPipeArg(null)).toBe('');
  });
});

describe('hasTeardownInPipeCall', () => {
  it('returns true when a valid teardown operator is present', () => {
    const pipeCall = callExpr(
      memberExpr(identifier('src$'), identifier('pipe')),
      [callExpr(identifier('takeUntilDestroyed'), [identifier('destroyRef')])]
    );
    expect(hasTeardownInPipeCall(pipeCall)).toBe(true);
  });

  it('returns false when no teardown operator is present', () => {
    const pipeCall = callExpr(
      memberExpr(identifier('src$'), identifier('pipe')),
      [callExpr(identifier('map'), [n('ArrowFunctionExpression')])]
    );
    expect(hasTeardownInPipeCall(pipeCall)).toBe(false);
  });

  it('returns false when arguments is not an array', () => {
    const node = n('CallExpression');
    expect(hasTeardownInPipeCall(node)).toBe(false);
  });
});

describe('hasTeardownInReceiverChain', () => {
  it('returns true when pipe with takeUntilDestroyed precedes subscribe', () => {
    const piped = callExpr(memberExpr(identifier('src$'), identifier('pipe')), [
      callExpr(identifier('takeUntilDestroyed'), [identifier('destroyRef')]),
    ]);
    expect(hasTeardownInReceiverChain(piped)).toBe(true);
  });

  it('returns false when pipe has only map (no teardown)', () => {
    const piped = callExpr(memberExpr(identifier('src$'), identifier('pipe')), [
      callExpr(identifier('map'), [n('ArrowFunctionExpression')]),
    ]);
    expect(hasTeardownInReceiverChain(piped)).toBe(false);
  });

  it('returns false for a plain observable with no pipe', () => {
    expect(hasTeardownInReceiverChain(identifier('src$'))).toBe(false);
  });
});

describe('getTemplateAbsoluteOffset', () => {
  it('returns nodeStart unchanged when templateStartOffset is present', () => {
    const ctx = { template: { templateStartOffset: 100 } };
    expect(getTemplateAbsoluteOffset(ctx, 50)).toBe(50);
  });

  it('returns nodeStart unchanged when templateStartOffset is absent', () => {
    expect(getTemplateAbsoluteOffset({}, 50)).toBe(50);
  });

  it('returns nodeStart unchanged when templateStartOffset is not finite', () => {
    const ctx = { template: { templateStartOffset: NaN } };
    expect(getTemplateAbsoluteOffset(ctx, 50)).toBe(50);
  });
});

describe('findObservableSourceCall', () => {
  it('returns the source call when there is no pipe', () => {
    const sourceCall = callExpr(
      memberExpr(identifier('this'), identifier('getUser')),
      [identifier('id')]
    );
    expect(findObservableSourceCall(sourceCall)).toBe(sourceCall);
  });

  it('walks through pipe() to the underlying source call', () => {
    const sourceCall = callExpr(
      memberExpr(identifier('this'), identifier('getUser')),
      [identifier('id')]
    );
    const piped = callExpr(memberExpr(sourceCall, identifier('pipe')), [
      callExpr(identifier('map'), [n('ArrowFunctionExpression')]),
    ]);
    expect(findObservableSourceCall(piped)).toBe(sourceCall);
  });

  it('returns null for non-call input', () => {
    expect(findObservableSourceCall(identifier('x'))).toBeNull();
  });
});

describe('isLikelyHttpObservable', () => {
  it('returns true for this.http.get(url)', () => {
    const sourceCall = callExpr(
      memberExpr(
        memberExpr(identifier('this'), identifier('http')),
        identifier('get')
      ),
      [literal('/api/users')]
    );
    expect(isLikelyHttpObservable(sourceCall)).toBe(true);
  });

  it('returns true for this.httpClient.post(url, body)', () => {
    const sourceCall = callExpr(
      memberExpr(
        memberExpr(identifier('this'), identifier('httpClient')),
        identifier('post')
      ),
      [literal('/api'), identifier('body')]
    );
    expect(isLikelyHttpObservable(sourceCall)).toBe(true);
  });

  it('returns true for this.userSvc.getUser(id) (HTTP-action prefix + arg)', () => {
    const sourceCall = callExpr(
      memberExpr(
        memberExpr(identifier('this'), identifier('userSvc')),
        identifier('getUser')
      ),
      [identifier('id')]
    );
    expect(isLikelyHttpObservable(sourceCall)).toBe(true);
  });

  it('returns false for this.svc.getUser() — no arguments (avoids false positive on synchronous getters)', () => {
    const sourceCall = callExpr(
      memberExpr(
        memberExpr(identifier('this'), identifier('svc')),
        identifier('getUser')
      ),
      []
    );
    expect(isLikelyHttpObservable(sourceCall)).toBe(false);
  });

  it('returns false for a plain identifier call', () => {
    expect(isLikelyHttpObservable(callExpr(identifier('doSomething')))).toBe(
      false
    );
  });

  it('returns false for null', () => {
    expect(isLikelyHttpObservable(null)).toBe(false);
  });
});

describe('getParamsArray', () => {
  it('returns the params array directly', () => {
    const params = [identifier('a'), identifier('b')];
    expect(getParamsArray(n('FunctionDeclaration', { params }))).toBe(params);
  });

  it('returns items when params has an items property', () => {
    const items = [identifier('a')];
    const fn = n('FunctionDeclaration', { params: { items } as any });
    expect(getParamsArray(fn)).toBe(items);
  });

  it('returns an empty array for null input', () => {
    expect(getParamsArray(null)).toEqual([]);
  });
});

describe('getParamIdentifierName', () => {
  it('returns the name for a plain Identifier param', () => {
    expect(getParamIdentifierName(identifier('myParam'))).toBe('myParam');
  });

  it('returns the name from an AssignmentPattern left side', () => {
    const param = n('AssignmentPattern', {
      left: identifier('x'),
      right: literal(0),
    });
    expect(getParamIdentifierName(param)).toBe('x');
  });

  it('returns the name from a RestElement', () => {
    const param = n('RestElement', { argument: identifier('rest') });
    expect(getParamIdentifierName(param)).toBe('rest');
  });

  it('returns the name from a TSParameterProperty', () => {
    const param = n('TSParameterProperty', { parameter: identifier('svc') });
    expect(getParamIdentifierName(param)).toBe('svc');
  });

  it('returns empty string for null', () => {
    expect(getParamIdentifierName(null)).toBe('');
  });
});

describe('getParamTypeName', () => {
  it('returns the type name from a TSTypeReference', () => {
    const typeNode = n('TSTypeReference', {
      typeName: identifier('MyService'),
    });
    const param = n('Identifier', {
      name: 'svc',
      typeAnnotation: { typeAnnotation: typeNode } as any,
    });
    expect(getParamTypeName(param)).toBe('MyService');
  });

  it('returns empty string when there is no type annotation', () => {
    expect(getParamTypeName(identifier('svc'))).toBe('');
  });

  it('returns empty string for null', () => {
    expect(getParamTypeName(null)).toBe('');
  });

  it('unwraps TSParameterProperty before reading the annotation', () => {
    const typeNode = n('TSTypeReference', { typeName: identifier('Router') });
    const inner = n('Identifier', {
      name: 'router',
      typeAnnotation: { typeAnnotation: typeNode } as any,
    });
    const param = n('TSParameterProperty', { parameter: inner });
    expect(getParamTypeName(param)).toBe('Router');
  });
});
