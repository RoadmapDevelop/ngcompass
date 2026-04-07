# no-document-access

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | SSR |
| **Applies to** | All `.ts` files |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

Angular supports **Server-Side Rendering (SSR)** via Angular Universal. When a component is rendered on the server, the browser globals (`document`, `window`, `localStorage`, etc.) **do not exist**. Accessing them throws a `ReferenceError` and crashes the server-side render.

```
Browser environment (✅):
  document.querySelector('.logo')  →  returns HTMLElement

Node.js / SSR environment (❌):
  document.querySelector('.logo')  →  ReferenceError: document is not defined
                                        ↑ Server crashes. No page served to client.
```

**Globals flagged by this rule:**

| Global | Why it's unsafe in SSR |
|---|---|
| `document` | DOM API — does not exist on Node.js |
| `window` | Browser global — not in Node.js |
| `localStorage` | Browser storage — not in Node.js |
| `sessionStorage` | Browser storage — not in Node.js |
| `navigator` | Browser navigation info — not in Node.js |
| `location` | Browser URL info — not in Node.js |

---

## Invalid Examples

```typescript
// ❌ Direct document access — crashes in SSR
@Component({ selector: 'app-nav', template: '...' })
export class NavComponent implements OnInit {
  ngOnInit() {
    const logo = document.querySelector('.logo'); // ❌ error
  }
}
```

```typescript
// ❌ window access in constructor
@Component({ selector: 'app-scroll', template: '...' })
export class ScrollComponent {
  constructor() {
    window.scrollTo(0, 0); // ❌ error
  }
}
```

```typescript
// ❌ localStorage access — no equivalent in Node.js
@Injectable({ providedIn: 'root' })
export class AuthService {
  getToken() {
    return localStorage.getItem('token'); // ❌ error
  }
}
```

---

## Valid Examples

```typescript
// ✅ Inject DOCUMENT — works in browser and SSR (returns mock document on server)
@Component({ selector: 'app-nav', template: '...' })
export class NavComponent {
  private doc = inject(DOCUMENT);

  ngOnInit() {
    const logo = this.doc.querySelector('.logo'); // ✅
  }
}
```

```typescript
// ✅ isPlatformBrowser() guard — browser code only runs in browser
@Component({ selector: 'app-scroll', template: '...' })
export class ScrollComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo(0, 0); // ✅ safe — only runs in browser
    }
  }
}
```

```typescript
// ✅ !isPlatformServer() negation — equivalent guard
ngOnInit() {
  if (!isPlatformServer(this.platformId)) {
    document.title = 'My App'; // ✅
  }
}
```

```typescript
// ✅ Variable-based guard — rule tracks the variable
ngOnInit() {
  const isBrowser = isPlatformBrowser(this.platformId);
  if (isBrowser) {
    localStorage.setItem('token', this.token); // ✅ rule recognizes isBrowser
  }
}
```

```typescript
// ✅ afterNextRender() — browser-only callback, never runs on server
@Component({ selector: 'app-chart', template: '...' })
export class ChartComponent {
  constructor() {
    afterNextRender(() => {
      document.querySelector('#chart'); // ✅ only runs in browser
    });
  }
}
```

---

## Guard Detection

The rule understands the following guard patterns:

```
Pattern                                    Detected as browser guard?
──────────────────────────────────────────────────────────────────────
if (isPlatformBrowser(id))                 ✅ Yes — direct call
if (!isPlatformServer(id))                 ✅ Yes — negated server check
const isBrowser = isPlatformBrowser(id);
if (isBrowser)                             ✅ Yes — variable-based guard
afterNextRender(() => { ... })             ✅ Yes — browser-only callback
afterRender(() => { ... })                 ✅ Yes — browser-only callback
if (someOtherCondition)                    ❌ No — unknown guard
```

---

## SSR-Safe Alternatives

| Direct access | SSR-safe replacement |
|---|---|
| `document.querySelector()` | `inject(DOCUMENT).querySelector()` |
| `document.title = x` | `inject(DOCUMENT).title = x` |
| `window.scrollTo()` | `afterNextRender(() => window.scrollTo())` |
| `localStorage.getItem()` | Custom `StorageService` with `isPlatformBrowser` guard |
| `navigator.userAgent` | Server-side: read from request headers |
| `location.href` | Use Angular's `Router` or inject `DOCUMENT` |

---

## Exemptions

| Pattern | Exempt? |
|---|---|
| Inside `if (isPlatformBrowser(...))` | ✅ |
| Inside `if (!isPlatformServer(...))` | ✅ |
| Inside `afterNextRender(() => ...)` | ✅ |
| Inside `afterRender(() => ...)` | ✅ |
| Variable recognized as `isPlatformBrowser()` result | ✅ |

---

## Related Rules

- [`prefer-after-render-over-after-view-init`](./prefer-after-render-over-after-view-init.md)
