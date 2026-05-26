import { afterEach, describe, it, expect } from 'vitest';
import {
  makeTypeAwareAngularClassFixture,
  type TypeAwareFixture,
} from './helpers.js';
import { noDocumentAccessRule } from '../src/rules/ssr/no-document-access.rule.js';
import { preferAfterRenderOverAfterViewInitRule } from '../src/rules/ssr/prefer-after-render-over-after-view-init.rule.js';

type ClassFixture = TypeAwareFixture & {
  classStreamNode: {
    node: unknown;
    metadata: Record<string, unknown>;
    decoratorName: string;
  };
};

describe('no-document-access', () => {
  let fx: ClassFixture | undefined;
  afterEach(() => {
    fx?.dispose();
    fx = undefined;
  });

  it('has correct name and streamType', () => {
    expect(noDocumentAccessRule.name).toBe('no-document-access');
    expect(noDocumentAccessRule.streamType).toBe('AnyAngularClass');
  });

  it('flags document.querySelector() method call inside a class', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                init() { document.querySelector('.foo'); }
            }
        `);
    const result = noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx);
    const failures = toArray(result);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.message).toContain('document');
  });

  it('flags window.scrollTo() method call', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                scroll() { window.scrollTo(0, 0); }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures[0]!.message).toContain('window');
  });

  it('flags localStorage.setItem() method call', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                save() { localStorage.setItem('key', 'val'); }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures[0]!.message).toContain('localStorage');
  });

  it('flags sessionStorage.getItem() method call', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                load() { return sessionStorage.getItem('k'); }
            }
        `);
    expect(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });

  it('flags navigator.geolocation.getCurrentPosition()', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                getLocation() { navigator.geolocation.getCurrentPosition(cb => cb); }
            }
        `);
    expect(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });

  it('flags property access: document.title = "x" (not just method calls)', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                setTitle() { document.title = 'My App'; }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures[0]!.message).toContain('document');
  });

  it('flags window.scrollY property read', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                getScroll() { return window.scrollY; }
            }
        `);
    expect(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });

  it('does NOT flag a user variable that shadows a browser-global name', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                init() {
                    const document = { querySelector: (_: string) => null };
                    document.querySelector('.foo');
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('does not flag a class with no browser global access', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                doWork() { this.myService?.doSomething(); }
                myService: any;
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('includes a fix recommendation', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                init() { document.querySelector('.cls'); }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures[0]!.fix).toBeDefined();
  });

  it('reports only ONE failure per browser global chain (no duplicates for chained access)', () => {
    fx = makeTypeAwareAngularClassFixture(`
            class AppComponent {
                init() { document.body.classList.add('active'); }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures.filter((f) => f.message?.includes('document')).length).toBe(
      1
    );
  });

  it('does NOT flag browser-global access inside an isPlatformBrowser() guard', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function isPlatformBrowser(id: unknown): boolean;
            class AppComponent {
                platformId: unknown;
                init() {
                    if (isPlatformBrowser(this.platformId)) {
                        document.querySelector('.foo');
                        window.scrollTo(0, 0);
                    }
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('still flags browser-global access OUTSIDE an isPlatformBrowser() guard', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function isPlatformBrowser(id: unknown): boolean;
            class AppComponent {
                platformId: unknown;
                init() {
                    if (isPlatformBrowser(this.platformId)) {
                        document.querySelector('.safe');
                    }
                    document.title = 'Always runs';
                }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures.some((f) => f.message?.includes('document'))).toBe(true);
  });

  it('does NOT flag browser access inside negated !isPlatformServer() guard', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function isPlatformServer(id: unknown): boolean;
            class AppComponent {
                platformId: unknown;
                init() {
                    if (!isPlatformServer(this.platformId)) {
                        document.title = 'Browser only';
                    }
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('does NOT flag browser access inside variable-based isPlatformBrowser guard', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function isPlatformBrowser(id: unknown): boolean;
            class AppComponent {
                platformId: unknown;
                init() {
                    const isBrowser = isPlatformBrowser(this.platformId);
                    if (isBrowser) {
                        window.scrollTo(0, 0);
                    }
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('does NOT flag browser access inside afterNextRender callback', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function afterNextRender(cb: () => void): void;
            class AppComponent {
                constructor() {
                    afterNextRender(() => { document.querySelector('.foo'); });
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('does NOT flag browser access inside afterRender callback', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function afterRender(cb: () => void): void;
            class AppComponent {
                constructor() {
                    afterRender(() => { window.scrollTo(0, 0); });
                }
            }
        `);
    expect(noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)).toBeNull();
  });

  it('still flags browser access OUTSIDE afterNextRender', () => {
    fx = makeTypeAwareAngularClassFixture(`
            declare function afterNextRender(cb: () => void): void;
            class AppComponent {
                constructor() {
                    afterNextRender(() => { document.querySelector('.safe'); });
                    document.title = 'Unsafe';
                }
            }
        `);
    const failures = toArray(
      noDocumentAccessRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures.some((f) => f.message?.includes('document'))).toBe(true);
  });
});

describe('prefer-after-render-over-after-view-init', () => {
  let fx: ClassFixture | undefined;
  afterEach(() => {
    fx?.dispose();
    fx = undefined;
  });

  it('has correct name and streamType', () => {
    expect(preferAfterRenderOverAfterViewInitRule.name).toBe(
      'prefer-after-render-over-after-view-init'
    );
    expect(preferAfterRenderOverAfterViewInitRule.streamType).toBe(
      'AnyAngularClass'
    );
  });

  it('flags ngAfterViewInit that accesses DOM (nativeElement)', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                el: { nativeElement: HTMLElement } = { nativeElement: null! };
                ngAfterViewInit() {
                    this.el.nativeElement.focus();
                }
            }
        `);
    const failures = toArray(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.severity).toBe('warn');
  });

  it('flags ngAfterViewInit that calls document.querySelector()', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                ngAfterViewInit() { document.querySelector('.cls'); }
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });

  it('does NOT flag ngAfterViewInit with no DOM access', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                ngAfterViewInit() { this.subscribeToUpdates(); }
                subscribeToUpdates() {}
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).toBeNull();
  });

  it('does NOT flag a component without ngAfterViewInit', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                ngOnInit() { this.setup(); }
                setup() {}
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).toBeNull();
  });

  it('flags ngAfterContentInit that accesses DOM', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                el: { nativeElement: HTMLElement } = { nativeElement: null! };
                ngAfterContentInit() {
                    this.el.nativeElement.appendChild(document.createElement('div'));
                }
            }
        `);
    const failures = toArray(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    );
    expect(failures[0]!.message).toContain('ngAfterContentInit');
  });

  it('does NOT flag ngAfterContentInit with no DOM access', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                ngAfterContentInit() { this.loadData(); }
                loadData() {}
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).toBeNull();
  });

  it('flags addEventListener via lib.dom receiver type', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                el: { nativeElement: HTMLElement } = { nativeElement: null! };
                ngAfterViewInit() {
                    this.el.nativeElement.addEventListener('click', () => {});
                }
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });

  it('flags parentElement access in ngAfterViewInit', () => {
    fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            @Component({ selector: 'app' })
            class AppComponent {
                el: { nativeElement: HTMLElement } = { nativeElement: null! };
                ngAfterViewInit() { const parent = this.el.nativeElement.parentElement; }
            }
        `);
    expect(
      preferAfterRenderOverAfterViewInitRule.handle(fx.classStreamNode, fx.ctx)
    ).not.toBeNull();
  });
});

function toArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}
