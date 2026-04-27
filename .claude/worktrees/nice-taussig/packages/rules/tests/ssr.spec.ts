/**
 * Unit Tests — SSR rules
 *
 * Covered rules:
 *  - no-document-access
 *  - prefer-after-render-over-after-view-init
 */

import { describe, it, expect } from 'vitest';
import { makeContext, makeAngularClassNode } from './helpers.js';
import { noDocumentAccessRule } from '../src/rules/ssr/no-document-access.rule.js';
import { preferAfterRenderOverAfterViewInitRule } from '../src/rules/ssr/prefer-after-render-over-after-view-init.rule.js';

// ---------------------------------------------------------------------------
// no-document-access
// ---------------------------------------------------------------------------

describe('no-document-access', () => {
    it('has correct name and streamType', () => {
        expect(noDocumentAccessRule.name).toBe('no-document-access');
        expect(noDocumentAccessRule.streamType).toBe('AnyAngularClass');
    });

    it('flags document.querySelector() method call inside a class', () => {
        const source = `
class AppComponent {
    init() { const el = document.querySelector('.foo'); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-doc-a.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].ruleName).toBe('no-document-access');
        expect(failures[0].severity).toBe('error');
        expect(failures[0].message).toContain('document');
    });

    it('flags window.scrollTo() method call', () => {
        const source = `
class AppComponent {
    scroll() { window.scrollTo(0, 0); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-win-b.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0].message).toContain('window');
    });

    it('flags localStorage.setItem() method call', () => {
        const source = `
class AppComponent {
    save() { localStorage.setItem('key', 'val'); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-ls-c.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0].message).toContain('localStorage');
    });

    it('flags sessionStorage.getItem() method call', () => {
        const source = `
class AppComponent {
    load() { return sessionStorage.getItem('k'); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-ss-d.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
    });

    it('flags navigator.geolocation.getCurrentPosition()', () => {
        const source = `
class AppComponent {
    getLocation() { navigator.geolocation.getCurrentPosition(cb); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-nav-e.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
    });

    it('flags property access: document.title = "x" (not just method calls)', () => {
        const source = `
class AppComponent {
    setTitle() { document.title = 'My App'; }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-prop-f.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0].message).toContain('document');
    });

    it('flags window.scrollY property read', () => {
        const source = `
class AppComponent {
    getScroll() { return window.scrollY; }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-scrolly-g.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
    });

    it('does not flag a class with no browser global access', () => {
        const source = `
class AppComponent {
    doWork() { this.myService.doSomething(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-clean-h.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('includes a fix recommendation', () => {
        const source = `
class AppComponent {
    init() { document.querySelector('.cls'); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-fix-i.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx) as any;
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0]?.fix).toBeDefined();
    });

    it('reports only ONE failure per browser global chain (no duplicates for chained access)', () => {
        // document.body.classList.add(...)  — three nested MemberExpressions, one root
        const source = `
class AppComponent {
    init() { document.body.classList.add('active'); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-chain-j.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        const failures = Array.isArray(result) ? result : (result ? [result] : []);
        // Only one failure should be reported for the document identifier
        expect(failures.filter(f => (f as any).message?.includes('document')).length).toBe(1);
    });

    it('does NOT flag browser-global access inside an isPlatformBrowser() guard', () => {
        // Access inside `if (isPlatformBrowser(platformId)) { ... }` is safe — the block
        // only executes in a browser context, not during SSR.
        const source = `
class AppComponent {
    constructor(private platformId: Object) {}
    init() {
        if (isPlatformBrowser(this.platformId)) {
            document.querySelector('.foo');
            window.scrollTo(0, 0);
        }
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-guard-k.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        // All access is inside the platform guard — no failures expected
        expect(result).toBeNull();
    });

    it('still flags browser-global access OUTSIDE an isPlatformBrowser() guard', () => {
        // Code outside the guard runs in SSR and must still be flagged.
        const source = `
class AppComponent {
    init() {
        if (isPlatformBrowser(this.platformId)) {
            document.querySelector('.safe');
        }
        document.title = 'Always runs';  // outside the guard — SSR-unsafe
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-guard-outside-l.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures.some((f: any) => f.message?.includes('document'))).toBe(true);
    });

    it('does NOT flag browser access inside negated !isPlatformServer() guard', () => {
        const source = `
class AppComponent {
    init() {
        if (!isPlatformServer(this.platformId)) {
            document.title = 'Browser only';
        }
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-negserver-m.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag browser access inside variable-based isPlatformBrowser guard', () => {
        const source = `
class AppComponent {
    init() {
        const isBrowser = isPlatformBrowser(this.platformId);
        if (isBrowser) {
            window.scrollTo(0, 0);
        }
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-varguard-n.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag browser access inside afterNextRender callback', () => {
        const source = `
class AppComponent {
    constructor() {
        afterNextRender(() => {
            document.querySelector('.foo');
        });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-anr-o.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag browser access inside afterRender callback', () => {
        const source = `
class AppComponent {
    constructor() {
        afterRender(() => {
            window.scrollTo(0, 0);
        });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-ar-p.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('still flags browser access OUTSIDE afterNextRender', () => {
        const source = `
class AppComponent {
    constructor() {
        afterNextRender(() => { document.querySelector('.safe'); });
        document.title = 'Unsafe';
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/ssr-anr-outside-q.component.ts');
        const result = noDocumentAccessRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures.some((f: any) => f.message?.includes('document'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// prefer-after-render-over-after-view-init
// ---------------------------------------------------------------------------

describe('prefer-after-render-over-after-view-init', () => {
    it('has correct name and streamType', () => {
        expect(preferAfterRenderOverAfterViewInitRule.name).toBe('prefer-after-render-over-after-view-init');
        expect(preferAfterRenderOverAfterViewInitRule.streamType).toBe('AnyAngularClass');
    });

    it('flags ngAfterViewInit that accesses DOM (nativeElement)', () => {
        const source = `
class AppComponent {
    ngAfterViewInit() {
        this.el.nativeElement.focus();
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-flag-a.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0].ruleName).toBe('prefer-after-render-over-after-view-init');
        expect(failures[0].severity).toBe('warn');
    });

    it('flags ngAfterViewInit that calls document.querySelector()', () => {
        const source = `
class AppComponent {
    ngAfterViewInit() {
        const el = document.querySelector('.cls');
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-flag-b.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
    });

    it('does NOT flag ngAfterViewInit with no DOM access', () => {
        const source = `
class AppComponent {
    ngAfterViewInit() {
        this.subscribeToUpdates();
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-clean-c.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a component without ngAfterViewInit', () => {
        const source = `class AppComponent { ngOnInit() { this.setup(); } }`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-no-avit-d.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag in a non-component/directive file', () => {
        const source = `
class SomePipe {
    ngAfterViewInit() { this.el.nativeElement.focus(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-pipe-e.pipe.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags ngAfterContentInit that accesses DOM', () => {
        const source = `
class AppComponent {
    ngAfterContentInit() {
        this.el.nativeElement.appendChild(child);
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-acit-dom-f.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures[0].message).toContain('ngAfterContentInit');
    });

    it('does NOT flag ngAfterContentInit with no DOM access', () => {
        const source = `
class AppComponent {
    ngAfterContentInit() {
        this.loadData();
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-acit-clean-g.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags new DOM patterns like addEventListener', () => {
        const source = `
class AppComponent {
    ngAfterViewInit() {
        this.el.nativeElement.addEventListener('click', this.handler);
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-ael-h.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
    });

    it('flags parentElement access in ngAfterViewInit', () => {
        const source = `
class AppComponent {
    ngAfterViewInit() {
        const parent = this.el.nativeElement.parentElement;
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/ssr-avit-parent-i.component.ts'
        );
        const result = preferAfterRenderOverAfterViewInitRule.handle(classStreamNode, ctx);
        expect(result).not.toBeNull();
    });
});
