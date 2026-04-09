# prefer-inject-over-constructor-di

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Modern API |
| **Applies to** | Component / directive / service constructors |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

Angular 14 introduced the `inject()` function as the modern way to obtain dependencies. It is strictly more capable than constructor injection and is the foundation for the signal-based API:

| Feature | Constructor DI | `inject()` |
|---|---|---|
| Works in field initializers | ❌ | ✅ |
| Works in factory functions | ❌ | ✅ |
| Compatible with `input()`, `output()`, `model()` | ❌ | ✅ |
| Compatible with functional guards / resolvers | ❌ | ✅ |
| Reduces boilerplate | ❌ | ✅ |

```typescript
// Constructor DI — forces a constructor block just for DI
constructor(
  private http: HttpClient,
  private router: Router,
  private store: Store,
) {}

// inject() — clean field declarations, no constructor needed
private http   = inject(HttpClient);
private router = inject(Router);
private store  = inject(Store);
```

---

## Invalid Examples

```typescript
// ❌ Constructor parameters used purely for dependency injection
@Component({ selector: 'app-user', template: '...' })
export class UserComponent {
  constructor(
    private userService: UserService,   // ⚠️ warn
    private router: Router,             // ⚠️ warn
  ) {}
}
```

```typescript
// ❌ Mixed constructor DI and logic (DI params still warned)
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private http: HttpClient,           // ⚠️ warn
    private tokenService: TokenService, // ⚠️ warn
    @Inject(API_URL) private apiUrl: string,
  ) {}
}
```

---

## Valid Examples

```typescript
// ✅ inject() — field initializers, no constructor required
@Component({ selector: 'app-user', template: '...' })
export class UserComponent {
  private userService = inject(UserService);
  private router      = inject(Router);
}
```

```typescript
// ✅ inject() with InjectionToken
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http     = inject(HttpClient);
  private apiUrl   = inject(API_URL);
  private token    = inject(TokenService);
}
```

```typescript
// ✅ Constructor still allowed when needed for non-DI logic
@Component({ selector: 'app-canvas', template: '<canvas #c></canvas>' })
export class CanvasComponent {
  private renderer = inject(Renderer2); // ✅ inject for DI

  constructor(private el: ElementRef) {
    // Constructor used for non-DI setup — still flagged for `el`
    // Better: private el = inject(ElementRef);
  }
}
```

---

## Exemptions

The rule **does not flag** constructor parameters that look like non-injectable primitives based on their type annotation or name:

- Parameters typed as `string`, `number`, `boolean`, `object`
- Parameters named `data`, `config`, `options`, `value`, `args`, etc.

---

## Migration Path

```typescript
// Before
constructor(
  private http: HttpClient,
  private router: Router,
) {
  this.init();
}

// After
private http   = inject(HttpClient);
private router = inject(Router);

constructor() {
  this.init();  // keep constructor only for non-DI logic
}
```

---

## Related Rules

- [`signal-prefer-input-signal`](./signal-prefer-input-signal.md) — modern input API
- [`signal-prefer-output-function`](./signal-prefer-output-function.md) — modern output API
