# prefer-after-render-over-after-view-init

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | SSR |
| **Applies to** | `.component.ts`, `.directive.ts` |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

The `ngAfterViewInit` and `ngAfterContentInit` lifecycle hooks run during **both browser and server rendering**. Any DOM access inside these hooks will fail on the server with a `ReferenceError`, breaking SSR.

`afterNextRender()` is the SSR-safe replacement — it is **guaranteed to run only in the browser**, after the first render, and is never called during server-side rendering.

```
Lifecycle timing:

 Server render:                          Browser render:
  Constructor ──▶ ngOnInit               Constructor ──▶ ngOnInit
  ngAfterContentInit ← 🔴 DOM fails!    ngAfterContentInit ─▶ runs
  ngAfterViewInit    ← 🔴 DOM fails!    ngAfterViewInit    ─▶ runs
                                         afterNextRender()  ─▶ runs (browser-only) ✅
```

---

## Invalid Examples

```typescript
// ❌ DOM access in ngAfterViewInit — crashes in SSR
@Component({ selector: 'app-chart', template: '<canvas #canvas></canvas>' })
export class ChartComponent {
  @ViewChild('canvas') canvasRef!: ElementRef;

  ngAfterViewInit() {
    const ctx = this.canvasRef.nativeElement.getContext('2d'); // ❌ warn
    this.renderChart(ctx);
  }
}
```

```typescript
// ❌ document.querySelector in ngAfterViewInit
ngAfterViewInit() {
  const el = document.querySelector('.sidebar'); // ❌ warn
  el?.classList.add('visible');
}
```

```typescript
// ❌ DOM access in ngAfterContentInit
@Component({ selector: 'app-tabs', template: '...' })
export class TabsComponent {
  ngAfterContentInit() {
    this.el.nativeElement.querySelectorAll('.tab') // ❌ warn
      .forEach(tab => tab.addEventListener('click', this.onTabClick));
  }
}
```

---

## Valid Examples

```typescript
// ✅ afterNextRender() — guaranteed browser-only, SSR-safe
@Component({ selector: 'app-chart', template: '<canvas #canvas></canvas>' })
export class ChartComponent {
  @ViewChild('canvas') canvasRef!: ElementRef;

  constructor() {
    afterNextRender(() => {
      const ctx = this.canvasRef.nativeElement.getContext('2d'); // ✅
      this.renderChart(ctx);
    });
  }
}
```

```typescript
// ✅ afterNextRender() for scroll/focus initialization
@Component({ selector: 'app-modal', template: '...' })
export class ModalComponent {
  private el = inject(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.el.nativeElement.querySelector('.close-btn')?.focus(); // ✅
    });
  }
}
```

```typescript
// ✅ isPlatformBrowser() guard inside ngAfterViewInit (alternative)
@Component({ selector: 'app-map', template: '...' })
export class MapComponent {
  private platformId = inject(PLATFORM_ID);

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initMap(); // ✅ guarded
    }
  }
}
```

```typescript
// ✅ Non-DOM work in ngAfterViewInit — not flagged
@Component({ selector: 'app-form', template: '...' })
export class FormComponent {
  ngAfterViewInit() {
    this.loadData(); // ✅ no DOM access — fine
    this.form.statusChanges.subscribe(...); // ✅ no DOM — fine
  }
}
```

---

## DOM Patterns Detected

The rule scans for any of these patterns inside `ngAfterViewInit` and `ngAfterContentInit`:

| Category | Patterns |
|---|---|
| Element access | `nativeElement`, `querySelector`, `querySelectorAll`, `getElementById`, `getElementsBy*` |
| Element traversal | `parentElement`, `parentNode`, `firstChild`, `lastChild`, `nextSibling`, `previousSibling`, `children`, `childNodes` |
| Dimensions | `getBoundingClientRect`, `getClientRects`, `offsetWidth`, `offsetHeight`, `clientWidth`, `clientHeight` |
| Scroll | `scrollIntoView`, `scrollTop`, `scrollLeft` |
| Visibility | `focus`, `blur` |
| Content | `innerHTML`, `outerHTML`, `textContent` |
| Manipulation | `createElement`, `appendChild`, `insertBefore`, `removeChild`, `replaceChild`, `cloneNode`, `dispatchEvent` |
| Attributes | `setAttribute`, `getAttribute`, `removeAttribute`, `hasAttribute`, `classList` |
| Queries | `contains`, `matches`, `closest` |
| Events | `addEventListener`, `removeEventListener` |
| Globals | `document`, `window`, `requestAnimationFrame`, `cancelAnimationFrame` |

---

## `afterNextRender` vs `afterRender`

| | `afterNextRender()` | `afterRender()` |
|---|---|---|
| Runs on | First render only | Every render |
| Use for | One-time DOM initialization | Ongoing DOM sync |
| SSR-safe | ✅ | ✅ |

---

## Exemptions

| Condition | Exempt? |
|---|---|
| `ngAfterViewInit` with no DOM access | ✅ |
| Non-component/directive files (pipes, services) | ✅ |
| DOM access inside `isPlatformBrowser()` guard | Not detected — use [`no-document-access`](./no-document-access.md) for that |

---

## Related Rules

- [`no-document-access`](./no-document-access.md) — direct browser global access
