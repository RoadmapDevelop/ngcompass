import { describe, it, expect } from 'vitest';
import {
  makeContext,
  makeAngularClassNode,
  findCallExpressions,
  findNodes,
} from './helpers.js';
import { noChangeDetectorRefRule } from '../src/rules/correctness/no-changedetectorref.rule.js';
import { noDirectiveAccessorRule } from '../src/rules/correctness/no-directive-accessor.rule.js';
import { noDirectiveWritablePropertyRule } from '../src/rules/correctness/no-directive-writable-property.rule.js';
import { noProvideZoneChangeDetectionRule } from '../src/rules/correctness/no-providezonechangedetection.rule.js';
import { noReactiveFormsRule } from '../src/rules/correctness/no-reactive-forms.rule.js';
import { noZoneJsImportRule } from '../src/rules/correctness/no-zonejs-import.rule.js';
import { noNgOnInitRule } from '../src/rules/correctness/no-ngoninit.rule.js';
import { noNgOnChangesRule } from '../src/rules/correctness/no-ngonchanges.rule.js';
import { noNgDoCheckRule } from '../src/rules/correctness/no-ngdocheck.rule.js';
import { noNgAfterContentInitRule } from '../src/rules/correctness/no-ngaftercontentinit.rule.js';
import { noNgAfterContentCheckedRule } from '../src/rules/correctness/no-ngaftercontentchecked.rule.js';
import { noNgAfterViewInitRule } from '../src/rules/correctness/no-ngafterviewinit.rule.js';
import { noNgAfterViewCheckedRule } from '../src/rules/correctness/no-ngafterviewchecked.rule.js';
import { noNgOnDestroyRule } from '../src/rules/correctness/no-ngondestroy.rule.js';
import { noViewDecoratorRule } from '../src/rules/modern-api/no-view-decorator.rule.js';
import { noContentDecoratorRule } from '../src/rules/modern-api/no-content-decorator.rule.js';
import { noDetectChangesTestingRule } from '../src/rules/testing/no-detectchanges-testing.rule.js';
import { noNgZoneTestingRule } from '../src/rules/testing/no-ngzone-testing.rule.js';
import { noZoneJsTestingFunctionsRule } from '../src/rules/testing/no-zonejs-testing-functions.rule.js';

const COMPONENT_PATH = '/src/app.component.ts';
const DIRECTIVE_PATH = '/src/app.directive.ts';
const PIPE_PATH = '/src/app.pipe.ts';
const SPEC_PATH = '/src/app.component.spec.ts';
const NON_SPEC_PATH = '/src/app.component.ts';
const POLYFILLS_PATH = '/src/polyfills.ts';
const CONFIG_PATH = '/src/app.config.ts';

const asArray = (r: unknown) => (Array.isArray(r) ? r : r ? [r] : []);

describe('no-changedetectorref', () => {
  it('has correct name and streamType', () => {
    expect(noChangeDetectorRefRule.name).toBe('no-changedetectorref');
    expect(noChangeDetectorRefRule.streamType).toBe('CallExpression');
  });

  it('flags inject(ChangeDetectorRef)', () => {
    const source = `
      class C { private cdr = inject(ChangeDetectorRef); }
    `;
    const ctx = makeContext(source, COMPONENT_PATH);
    const calls = findCallExpressions(ctx.program, 'inject');
    expect(calls.length).toBe(1);
    const result = noChangeDetectorRefRule.handle(calls[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.ruleName).toBe('no-changedetectorref');
    expect(result.severity).toBe('error');
  });

  it('does NOT flag inject() with a non-CDR token', () => {
    const source = `class C { private svc = inject(SomeService); }`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const calls = findCallExpressions(ctx.program, 'inject');
    const result = noChangeDetectorRefRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag an unrelated call expression', () => {
    const source = `inject;`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const calls = findCallExpressions(ctx.program);
    expect(calls.length).toBe(0);
  });
});

describe('no-directive-accessor', () => {
  it('has correct name and streamType', () => {
    expect(noDirectiveAccessorRule.name).toBe('no-directive-accessor');
    expect(noDirectiveAccessorRule.streamType).toBe('AnyAngularClass');
  });

  it('flags a public getter in a component', () => {
    const source = `
      class C {
        private products: string[] = [];
        get count() { return this.products.length; }
      }
    `;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveAccessorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('count');
  });

  it('flags a protected setter in a directive', () => {
    const source = `
      class D {
        private products: string[] = [];
        protected set total(value: number) { this.products = new Array(value); }
      }
    `;
    const { classStreamNode, ctx } = makeAngularClassNode(source, DIRECTIVE_PATH);
    const result = noDirectiveAccessorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('total');
  });

  it('does NOT flag a private getter', () => {
    const source = `
      class C {
        private get name() { return 'Elmo'; }
      }
    `;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveAccessorRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT fire on a non-component/directive class', () => {
    const source = `class P { get count() { return 1; } }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, PIPE_PATH);
    const result = noDirectiveAccessorRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });
});

describe('no-directive-writable-property', () => {
  it('has correct name and streamType', () => {
    expect(noDirectiveWritablePropertyRule.name).toBe(
      'no-directive-writable-property'
    );
    expect(noDirectiveWritablePropertyRule.streamType).toBe('AnyAngularClass');
  });

  it('flags a writable public property', () => {
    const source = `class C { name = 'Elmo'; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveWritablePropertyRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('name');
  });

  it('flags a writable protected property', () => {
    const source = `class C { protected count = 0; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveWritablePropertyRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
  });

  it('does NOT flag a readonly property', () => {
    const source = `class C { readonly name = 'Elmo'; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveWritablePropertyRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag a private property', () => {
    const source = `class C { private name = 'Elmo'; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noDirectiveWritablePropertyRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });

  it('does NOT fire on a service class', () => {
    const source = `class S { value = 1; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/foo.service.ts'
    );
    const result = noDirectiveWritablePropertyRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });
});

describe('no-providezonechangedetection', () => {
  it('has correct name and streamType', () => {
    expect(noProvideZoneChangeDetectionRule.name).toBe(
      'no-providezonechangedetection'
    );
    expect(noProvideZoneChangeDetectionRule.streamType).toBe('CallExpression');
  });

  it('flags provideZoneChangeDetection() in a config file', () => {
    const source = `
      export const appConfig = {
        providers: [provideZoneChangeDetection()],
      };
    `;
    const ctx = makeContext(source, CONFIG_PATH);
    const calls = findCallExpressions(ctx.program, 'provideZoneChangeDetection');
    expect(calls.length).toBe(1);
    const result = noProvideZoneChangeDetectionRule.handle(calls[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.severity).toBe('error');
  });

  it('does NOT flag a different provideX() call', () => {
    const source = `const p = provideRouter([]);`;
    const ctx = makeContext(source, CONFIG_PATH);
    const calls = findCallExpressions(ctx.program, 'provideRouter');
    const result = noProvideZoneChangeDetectionRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });
});

describe('no-reactive-forms', () => {
  it('has correct name and streamType', () => {
    expect(noReactiveFormsRule.name).toBe('no-reactive-forms');
    expect(noReactiveFormsRule.streamType).toBe('NewExpression');
  });

  it('flags new FormControl(...)', () => {
    const source = `const c = new FormControl('');`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const news = findNodes(ctx.program, (n: any) => n.type === 'NewExpression');
    expect(news.length).toBe(1);
    const result = noReactiveFormsRule.handle(news[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.message).toContain('FormControl');
  });

  it('flags new FormGroup({...})', () => {
    const source = `const g = new FormGroup({});`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const news = findNodes(ctx.program, (n: any) => n.type === 'NewExpression');
    const result = noReactiveFormsRule.handle(news[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.message).toContain('FormGroup');
  });

  it('flags new FormArray([])', () => {
    const source = `const a = new FormArray([]);`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const news = findNodes(ctx.program, (n: any) => n.type === 'NewExpression');
    const result = noReactiveFormsRule.handle(news[0], ctx) as any;
    expect(result).not.toBeNull();
  });

  it('flags new UntypedFormBuilder()', () => {
    const source = `const b = new UntypedFormBuilder();`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const news = findNodes(ctx.program, (n: any) => n.type === 'NewExpression');
    const result = noReactiveFormsRule.handle(news[0], ctx) as any;
    expect(result).not.toBeNull();
  });

  it('does NOT flag an unrelated NewExpression', () => {
    const source = `const d = new Date();`;
    const ctx = makeContext(source, COMPONENT_PATH);
    const news = findNodes(ctx.program, (n: any) => n.type === 'NewExpression');
    const result = noReactiveFormsRule.handle(news[0], ctx);
    expect(result).toBeNull();
  });
});

describe('no-zonejs-import', () => {
  it('has correct name and streamType', () => {
    expect(noZoneJsImportRule.name).toBe('no-zonejs-import');
    expect(noZoneJsImportRule.streamType).toBe('ImportDeclaration');
  });

  it("flags import 'zone.js'", () => {
    const source = `import 'zone.js';`;
    const ctx = makeContext(source, POLYFILLS_PATH);
    const imports = findNodes(
      ctx.program,
      (n: any) => n.type === 'ImportDeclaration'
    );
    expect(imports.length).toBe(1);
    const result = noZoneJsImportRule.handle(imports[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.severity).toBe('error');
  });

  it("flags import 'zone.js/testing'", () => {
    const source = `import 'zone.js/testing';`;
    const ctx = makeContext(source, POLYFILLS_PATH);
    const imports = findNodes(
      ctx.program,
      (n: any) => n.type === 'ImportDeclaration'
    );
    const result = noZoneJsImportRule.handle(imports[0], ctx) as any;
    expect(result).not.toBeNull();
  });

  it("does NOT flag an import that is not zone.js", () => {
    const source = `import { Component } from '@angular/core';`;
    const ctx = makeContext(source, '/src/app.module.ts');
    const imports = findNodes(
      ctx.program,
      (n: any) => n.type === 'ImportDeclaration'
    );
    const result = noZoneJsImportRule.handle(imports[0], ctx);
    expect(result).toBeNull();
  });
});

const lifecycleRules = [
  { name: 'no-ngoninit', hook: 'ngOnInit', rule: noNgOnInitRule },
  { name: 'no-ngonchanges', hook: 'ngOnChanges', rule: noNgOnChangesRule },
  { name: 'no-ngdocheck', hook: 'ngDoCheck', rule: noNgDoCheckRule },
  {
    name: 'no-ngaftercontentinit',
    hook: 'ngAfterContentInit',
    rule: noNgAfterContentInitRule,
  },
  {
    name: 'no-ngaftercontentchecked',
    hook: 'ngAfterContentChecked',
    rule: noNgAfterContentCheckedRule,
  },
  {
    name: 'no-ngafterviewinit',
    hook: 'ngAfterViewInit',
    rule: noNgAfterViewInitRule,
  },
  {
    name: 'no-ngafterviewchecked',
    hook: 'ngAfterViewChecked',
    rule: noNgAfterViewCheckedRule,
  },
  { name: 'no-ngondestroy', hook: 'ngOnDestroy', rule: noNgOnDestroyRule },
] as const;

for (const { name, hook, rule } of lifecycleRules) {
  describe(name, () => {
    it(`has correct name and streamType`, () => {
      expect(rule.name).toBe(name);
      expect(rule.streamType).toBe('AnyAngularClass');
    });

    it(`flags ${hook}() in a component`, () => {
      const source = `class C { ${hook}() {} }`;
      const { classStreamNode, ctx } = makeAngularClassNode(
        source,
        COMPONENT_PATH
      );
      const result = rule.handle(classStreamNode, ctx);
      const failures = asArray(result);
      expect(failures.length).toBe(1);
      expect((failures[0] as any).ruleName).toBe(name);
      expect((failures[0] as any).severity).toBe('error');
    });

    it(`flags ${hook}() in a directive`, () => {
      const source = `class D { ${hook}() {} }`;
      const { classStreamNode, ctx } = makeAngularClassNode(
        source,
        DIRECTIVE_PATH
      );
      const result = rule.handle(classStreamNode, ctx);
      expect(asArray(result).length).toBe(1);
    });

    it(`does NOT flag an unrelated method named differently`, () => {
      const source = `class C { otherMethod() {} }`;
      const { classStreamNode, ctx } = makeAngularClassNode(
        source,
        COMPONENT_PATH
      );
      const result = rule.handle(classStreamNode, ctx);
      expect(result).toBeNull();
    });

    it(`does NOT fire on a service class`, () => {
      const source = `class S { ${hook}() {} }`;
      const { classStreamNode, ctx } = makeAngularClassNode(
        source,
        '/src/foo.service.ts'
      );
      const result = rule.handle(classStreamNode, ctx);
      expect(result).toBeNull();
    });
  });
}

describe('no-view-decorator', () => {
  it('has correct name and streamType', () => {
    expect(noViewDecoratorRule.name).toBe('no-view-decorator');
    expect(noViewDecoratorRule.streamType).toBe('AnyAngularClass');
  });

  it('flags @ViewChild() in a component', () => {
    const source = `class C { @ViewChild(Foo) child!: Foo; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noViewDecoratorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('ViewChild');
  });

  it('flags @ViewChildren() in a directive', () => {
    const source = `class D { @ViewChildren(Foo) children!: any; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, DIRECTIVE_PATH);
    const result = noViewDecoratorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('ViewChildren');
  });

  it('does NOT flag @Input() (different decorator)', () => {
    const source = `class C { @Input() value = ''; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noViewDecoratorRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });
});

describe('no-content-decorator', () => {
  it('has correct name and streamType', () => {
    expect(noContentDecoratorRule.name).toBe('no-content-decorator');
    expect(noContentDecoratorRule.streamType).toBe('AnyAngularClass');
  });

  it('flags @ContentChild() in a component', () => {
    const source = `class C { @ContentChild(Foo) item!: Foo; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noContentDecoratorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('ContentChild');
  });

  it('flags @ContentChildren() in a directive', () => {
    const source = `class D { @ContentChildren(Foo) items!: any; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, DIRECTIVE_PATH);
    const result = noContentDecoratorRule.handle(classStreamNode, ctx);
    const failures = asArray(result);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).message).toContain('ContentChildren');
  });

  it('does NOT flag @ViewChild() (different decorator)', () => {
    const source = `class C { @ViewChild(Foo) item!: Foo; }`;
    const { classStreamNode, ctx } = makeAngularClassNode(source, COMPONENT_PATH);
    const result = noContentDecoratorRule.handle(classStreamNode, ctx);
    expect(result).toBeNull();
  });
});

describe('no-detectchanges-testing', () => {
  it('has correct name and streamType', () => {
    expect(noDetectChangesTestingRule.name).toBe('no-detectchanges-testing');
    expect(noDetectChangesTestingRule.streamType).toBe('CallExpression');
  });

  it('flags fixture.detectChanges() in a spec file', () => {
    const source = `fixture.detectChanges();`;
    const ctx = makeContext(source, SPEC_PATH);
    const calls = findCallExpressions(ctx.program, 'detectChanges');
    expect(calls.length).toBe(1);
    const result = noDetectChangesTestingRule.handle(calls[0], ctx) as any;
    expect(result).not.toBeNull();
    expect(result.severity).toBe('error');
  });

  it('does NOT flag detectChanges() in a non-spec file', () => {
    const source = `fixture.detectChanges();`;
    const ctx = makeContext(source, NON_SPEC_PATH);
    const calls = findCallExpressions(ctx.program, 'detectChanges');
    const result = noDetectChangesTestingRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag whenStable()', () => {
    const source = `await fixture.whenStable();`;
    const ctx = makeContext(source, SPEC_PATH);
    const calls = findCallExpressions(ctx.program, 'whenStable');
    const result = noDetectChangesTestingRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });
});

describe('no-ngzone-testing', () => {
  it('has correct name and streamType', () => {
    expect(noNgZoneTestingRule.name).toBe('no-ngzone-testing');
    expect(noNgZoneTestingRule.streamType).toBe('CallExpression');
  });

  it('flags fixture.ngZone in a spec file', () => {
    const source = `
      it('should', () => {
        fixture.ngZone;
      });
    `;
    const ctx = makeContext(source, SPEC_PATH);
    const calls = findCallExpressions(ctx.program);
    expect(calls.length).toBeGreaterThan(0);
    const result = noNgZoneTestingRule.handle(calls[0], ctx) as any;
    const failures = asArray(result);
    expect(failures.length).toBeGreaterThan(0);
    expect((failures[0] as any).ruleName).toBe('no-ngzone-testing');
  });

  it('does NOT flag fixture.ngZone in a non-spec file', () => {
    const source = `
      it('should', () => {
        fixture.ngZone;
      });
    `;
    const ctx = makeContext(source, NON_SPEC_PATH);
    const calls = findCallExpressions(ctx.program);
    const result = noNgZoneTestingRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });
});

describe('no-zonejs-testing-functions', () => {
  it('has correct name and streamType', () => {
    expect(noZoneJsTestingFunctionsRule.name).toBe('no-zonejs-testing-functions');
    expect(noZoneJsTestingFunctionsRule.streamType).toBe('CallExpression');
  });

  const zoneFns = [
    'fakeAsync',
    'tick',
    'flush',
    'flushMicrotasks',
    'discardPeriodicTasks',
    'resetFakeAsyncZone',
    'waitForAsync',
  ];

  for (const fn of zoneFns) {
    it(`flags ${fn}() call`, () => {
      const source = `${fn}();`;
      const ctx = makeContext(source, SPEC_PATH);
      const calls = findCallExpressions(ctx.program, fn);
      expect(calls.length).toBe(1);
      const result = noZoneJsTestingFunctionsRule.handle(
        calls[0],
        ctx
      ) as any;
      expect(result).not.toBeNull();
      expect(result.message).toContain(fn);
      expect(result.severity).toBe('error');
    });
  }

  it('does NOT flag an unrelated identifier-call', () => {
    const source = `regularHelper();`;
    const ctx = makeContext(source, SPEC_PATH);
    const calls = findCallExpressions(ctx.program, 'regularHelper');
    const result = noZoneJsTestingFunctionsRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });
});
