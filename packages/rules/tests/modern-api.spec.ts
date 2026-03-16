/**
 * Unit Tests - modern-api rules
 *
 * Covered rules:
 *  - prefer-inject (constructor DI -> inject())
 *  - signal-prefer-input-signal
 *  - signal-prefer-output-function
 *  - signal-prefer-model
 */

import { describe, it, expect } from 'vitest';
import { makeAngularClassNode } from './helpers.js';
import { signalPreferInputSignalRule } from '../src/rules/modern-api/signal-prefer-input-signal.rule.js';
import { signalPreferOutputFunctionRule } from '../src/rules/modern-api/signal-prefer-output-function.rule.js';
import { signalPreferModelRule } from '../src/rules/modern-api/signal-prefer-model.rule.js';
import { preferInjectRule } from '../src/rules/modern-api/prefer-inject.rule.js';

// ---------------------------------------------------------------------------
// prefer-inject
// ---------------------------------------------------------------------------

describe('prefer-inject', () => {
    it('has correct name and streamType', () => {
        expect(preferInjectRule.name).toBe('prefer-inject-over-constructor-di');
        expect(preferInjectRule.streamType).toBe('AnyAngularClass');
    });

    it('flags a constructor with a DI service parameter', () => {
        const source = `
class AppComponent {
    constructor(private userService: UserService) {}
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-flag-a.component.ts'
        );
        const result = preferInjectRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
        expect(result.ruleName).toBe('prefer-inject-over-constructor-di');
        expect(result.severity).toBe('warn');
        expect(result.message).toContain('inject()');
    });

    it('flags a constructor with multiple DI parameters', () => {
        const source = `
class MyComponent {
    constructor(private router: Router, private store: Store) {}
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-flag-b.component.ts'
        );
        const result = preferInjectRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
        // param names resolve to <param> without TypeChecker — verify rule fires correctly
        expect(result.message).toContain('inject()');
    });

    it('does NOT flag a class with no constructor', () => {
        const source = `class PureComponent { ngOnInit() {} }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-no-ctor-c.component.ts'
        );
        const result = preferInjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a constructor with only primitive-typed parameters', () => {
        // No access modifier -> hasParamPropertyModifier is false; type 'number' is primitive -> skip
        const source = `class DataClass { constructor(count: number) {} }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-no-di-d.component.ts'
        );
        const result = preferInjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags a constructor param decorated with @Inject()', () => {
        const source = `
class DataComponent {
    constructor(@Inject(TOKEN) private token: string) {}
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-decorated-e.component.ts'
        );
        // Decorated params are always considered DI params regardless of type
        const result = preferInjectRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
    });

    it('flags a well-known DI param name (http, router, store, etc.)', () => {
        const source = `class ApiComponent { constructor(private http: any) {} }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/inject-http-f.component.ts'
        );
        // 'http' is in DIISH_PARAM_NAMES -- should be flagged
        const result = preferInjectRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-input-signal
// ---------------------------------------------------------------------------

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
            source, '/src/input-flag-a.component.ts'
        );
        const result = signalPreferInputSignalRule.handle(classStreamNode, ctx) as any;
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
            source, '/src/input-multi-b.component.ts'
        );
        const result = signalPreferInputSignalRule.handle(classStreamNode, ctx) as any;
        const failures = Array.isArray(result) ? result : (result ? [result] : []);
        expect(failures.length).toBe(2);
    });

    it('does NOT flag a property without @Input() decorator', () => {
        const source = `class AppComponent { title: string = ''; }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/input-no-dec-c.component.ts'
        );
        const result = signalPreferInputSignalRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag @Input() in a non-component/directive file', () => {
        const source = `class SomePipe { @Input() value: string = ''; }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/input-pipe-d.pipe.ts'
        );
        const result = signalPreferInputSignalRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags @Input() in a directive file (.directive.ts)', () => {
        const source = `class HighlightDirective { @Input() color: string = 'yellow'; }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/input-dir-e.directive.ts'
        );
        const result = signalPreferInputSignalRule.handle(classStreamNode, ctx) as any;
        const failures = Array.isArray(result) ? result : (result ? [result] : []);
        expect(failures.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-output-function
// ---------------------------------------------------------------------------

describe('signal-prefer-output-function', () => {
    it('has correct name and streamType', () => {
        expect(signalPreferOutputFunctionRule.name).toBe('signal-prefer-output-function');
        expect(signalPreferOutputFunctionRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-model
// ---------------------------------------------------------------------------

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
            source, '/src/signal-pair.component.ts'
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
