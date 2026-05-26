import { afterEach, describe, it, expect } from 'vitest';
import {
  makeAngularClassNode,
  makeTypeAwareContext,
  makeTypeAwareAngularClassFixture,
  findNodes,
  type TypeAwareFixture,
} from './helpers.js';
import { signalPreferInputSignalRule } from '../src/rules/modern-api/signal-prefer-input-signal.rule.js';
import { signalPreferOutputFunctionRule } from '../src/rules/modern-api/signal-prefer-output-function.rule.js';
import { signalPreferModelRule } from '../src/rules/modern-api/signal-prefer-model.rule.js';
import { preferInjectRule } from '../src/rules/modern-api/prefer-inject.rule.js';

describe('prefer-inject', () => {
  let fixture: TypeAwareFixture | undefined;
  afterEach(() => {
    fixture?.dispose();
    fixture = undefined;
  });

  const classNodeFromFixture = (
    fx: TypeAwareFixture,
    decoratorName: string
  ) => {
    const classNode = findNodes(
      fx.oxcProgram,
      (n: any) => n.type === 'ClassDeclaration'
    )[0];
    return { node: classNode, metadata: {}, decoratorName };
  };

  it('has correct name and streamType', () => {
    expect(preferInjectRule.name).toBe('prefer-inject-over-constructor-di');
    expect(preferInjectRule.streamType).toBe('AnyAngularClass');
  });

  it('flags a constructor parameter whose type is a class decorated with @Injectable', () => {
    const source = `
import { Component, Injectable } from '@angular/core';

@Injectable()
export class UserService {}

@Component({ selector: 'app-root' })
export class AppComponent {
    constructor(private userService: UserService) {}
}`;
    fixture = makeTypeAwareContext(source);
    const result = preferInjectRule.handle(
      classNodeFromFixture(fixture, 'Component'),
      fixture.ctx
    ) as any;
    expect(result).not.toBeNull();
    expect(result.ruleName).toBe('prefer-inject-over-constructor-di');
    expect(result.severity).toBe('warn');
    expect(result.message).toContain('inject()');
    expect(result.message).toContain('userService: UserService');
  });

  it('flags a constructor parameter whose type lives in an @angular/* package', () => {
    const source = `
import { Component, Router } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({ selector: 'app-root' })
export class AppComponent {
    constructor(private router: Router, private http: HttpClient) {}
}`;
    fixture = makeTypeAwareContext(source);
    const result = preferInjectRule.handle(
      classNodeFromFixture(fixture, 'Component'),
      fixture.ctx
    ) as any;
    expect(result).not.toBeNull();
    expect(result.message).toContain('router: Router');
    expect(result.message).toContain('http: HttpClient');
  });

  it('does NOT flag a class with no constructor', () => {
    const source = `class PureComponent { ngOnInit() {} }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/inject-no-ctor-c.component.ts'
    );
    const result = preferInjectRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag a constructor whose parameter type is a user class with no DI markers', () => {
    const source = `
import { Component } from '@angular/core';

// A plain user class — no @Injectable, not from @angular/*. The rule must
// not assume DI just because the parameter has a "private" modifier and a
// class-typed declaration.
class LocalHelper { static make() { return new LocalHelper(); } }

@Component({ selector: 'app-root' })
export class AppComponent {
    constructor(private helper: LocalHelper) {}
}`;
    fixture = makeTypeAwareContext(source);
    const result = preferInjectRule.handle(
      classNodeFromFixture(fixture, 'Component'),
      fixture.ctx
    );
    expect(result).toBeNull();
  });

  it('does NOT flag a constructor with only primitive-typed parameters', () => {
    const source = `class DataClass { constructor(count: number) {} }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/inject-no-di-d.component.ts'
    );
    const result = preferInjectRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('flags a parameter carrying @Inject() resolved to @angular/core', () => {
    const source = `
import { Component, Inject, InjectionToken } from '@angular/core';

const TOKEN = new InjectionToken<string>('TOKEN');

@Component({ selector: 'app-root' })
export class DataComponent {
    constructor(@Inject(TOKEN) private token: string) {}
}`;
    fixture = makeTypeAwareContext(source);
    const result = preferInjectRule.handle(
      classNodeFromFixture(fixture, 'Component'),
      fixture.ctx
    ) as any;
    expect(result).not.toBeNull();
    expect(result.message).toContain('token: string');
  });

  it('does NOT flag @Inject when it is a user-defined decorator with the same name', () => {
    const source = `
import { Component } from '@angular/core';

// User-defined "Inject" — same name, different origin. The rule must
// reject this lookalike: only @Inject from @angular/core counts.
function Inject(_token: unknown): ParameterDecorator { return () => undefined; }

@Component({ selector: 'app-root' })
export class DataComponent {
    constructor(@Inject('whatever') private token: string) {}
}`;
    fixture = makeTypeAwareContext(source);
    const result = preferInjectRule.handle(
      classNodeFromFixture(fixture, 'Component'),
      fixture.ctx
    );
    expect(result).toBeNull();
  });
});

describe('signal-prefer-input-signal', () => {
  it('has correct name and streamType', () => {
    expect(signalPreferInputSignalRule.name).toBe('signal-prefer-input-signal');
    expect(signalPreferInputSignalRule.streamType).toBe('AnyAngularClass');
  });

  it('flags an @Input() decorated property in a component', () => {
    const source = `
class AppComponent {
    @Input() title: string = '';
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/input-flag-a.component.ts'
    );
    const result = signalPreferInputSignalRule.handle(
      classStreamNode,
      ctx
    ) as any;
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].ruleName).toBe('signal-prefer-input-signal');
    expect(failures[0].message).toContain('title');
  });

  it('flags multiple @Input() properties and reports all of them', () => {
    const source = `
class CardComponent {
    @Input() label: string = '';
    @Input() count: number = 0;
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/input-multi-b.component.ts'
    );
    const result = signalPreferInputSignalRule.handle(
      classStreamNode,
      ctx
    ) as any;
    const failures = Array.isArray(result) ? result : result ? [result] : [];
    expect(failures.length).toBe(2);
  });

  it('does NOT flag a property without @Input() decorator', () => {
    const source = `class AppComponent { title: string = ''; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/input-no-dec-c.component.ts'
    );
    const result = signalPreferInputSignalRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag @Input() in a non-component/directive file', () => {
    const source = `class SomePipe { @Input() value: string = ''; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/input-pipe-d.pipe.ts'
    );
    const result = signalPreferInputSignalRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('flags @Input() in a directive file (.directive.ts)', () => {
    const source = `class HighlightDirective { @Input() color: string = 'yellow'; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/input-dir-e.directive.ts'
    );
    const result = signalPreferInputSignalRule.handle(
      classStreamNode,
      ctx
    ) as any;
    const failures = Array.isArray(result) ? result : result ? [result] : [];
    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('signal-prefer-output-function', () => {
  it('has correct name and streamType', () => {
    expect(signalPreferOutputFunctionRule.name).toBe(
      'signal-prefer-output-function'
    );
    expect(signalPreferOutputFunctionRule.streamType).toBe('AnyAngularClass');
  });

  it('flags @Output() EventEmitter in a component', () => {
    const fx = makeTypeAwareAngularClassFixture(`
            import { Component, Output, EventEmitter } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                @Output() clicked = new EventEmitter<void>();
            }
        `);
    try {
      const result = signalPreferOutputFunctionRule.handle(
        fx.classStreamNode,
        fx.ctx
      ) as any;
      expect(result).not.toBeNull();
      const failures = Array.isArray(result) ? result : [result];
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].ruleName).toBe('signal-prefer-output-function');
      expect(failures[0].message).toContain('clicked');
      expect(failures[0].message).toContain('output()');
    } finally {
      fx.dispose();
    }
  });

  it('flags multiple @Output() EventEmitters and reports all', () => {
    const fx = makeTypeAwareAngularClassFixture(`
            import { Component, Output, EventEmitter } from '@angular/core';
            @Component({ selector: 'app' })
            class ButtonComponent {
                @Output() clicked = new EventEmitter<void>();
                @Output() hovered = new EventEmitter<MouseEvent>();
            }
        `);
    try {
      const result = signalPreferOutputFunctionRule.handle(
        fx.classStreamNode,
        fx.ctx
      ) as any;
      const failures = Array.isArray(result) ? result : result ? [result] : [];
      expect(failures.length).toBe(2);
    } finally {
      fx.dispose();
    }
  });

  it('does NOT flag a property without @Output() decorator', () => {
    const source = `class AppComponent { emitter = new EventEmitter<void>(); }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/output-no-dec-c.component.ts'
    );
    const result = signalPreferOutputFunctionRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag in a non-component/directive file', () => {
    const source = `class DataPipe { @Output() change = new EventEmitter<void>(); }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/output-pipe-d.pipe.ts'
    );
    const result = signalPreferOutputFunctionRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });
});

describe('signal-prefer-model', () => {
  it('has correct name and streamType', () => {
    expect(signalPreferModelRule.name).toBe('signal-prefer-model');
    expect(signalPreferModelRule.streamType).toBe('AnyAngularClass');
  });

  it('flags separate input() and output() signals that should be a model()', () => {
    const source = `
@Component({
  selector: 'app-invalid-input-output-pair',
  template: '',
  standalone: true
})
export class InvalidInputOutputPairComponent {
  value = input<string>('');
  valueChange = output<string>();
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/signal-pair.component.ts'
    );
    const result = signalPreferModelRule.handle(classStreamNode, ctx) as any;
    expect(result).not.toBeNull();
    const failures = Array.isArray(result) ? result : [result];
    expect(failures.length).toBe(1);
    expect(failures[0].message).toContain('value');
    expect(failures[0].message).toContain('valueChange');
    expect(failures[0].message).toContain('model()');
  });
});
