# signal-prefer-output-function

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Modern API |
| **Applies to** | `.component.ts`, `.directive.ts` |
| **Stream** | `DecoratedProperty` |

---

## Why This Rule Exists

Angular 17.3 introduced `output()` as the modern alternative to `@Output() EventEmitter`. The new API:

- Removes the need to import and instantiate `EventEmitter`.
- Is consistent with `input()` and `model()` — all component I/O uses the same function-based style.
- Has a cleaner type — `OutputEmitterRef<T>` instead of `EventEmitter<T>`.
- Supports `outputFromObservable()` for RxJS integration without a subscription.

---

## Invalid Examples

```typescript
// ❌ @Output() with EventEmitter
@Component({ selector: 'app-button', template: '<button (click)="click()">Go</button>' })
export class ButtonComponent {
  @Output() clicked = new EventEmitter<void>();       // ⚠️ warn
  @Output() valueChanged = new EventEmitter<string>(); // ⚠️ warn

  click() {
    this.clicked.emit();
  }
}
```

```typescript
// ❌ Typed EventEmitter
@Directive({ selector: '[appDrag]' })
export class DragDirective {
  @Output() dropped = new EventEmitter<DragEvent>(); // ⚠️ warn
}
```

---

## Valid Examples

```typescript
// ✅ output() — no EventEmitter needed
@Component({ selector: 'app-button', template: '<button (click)="click()">Go</button>' })
export class ButtonComponent {
  clicked      = output<void>();
  valueChanged = output<string>();

  click() {
    this.clicked.emit();
  }
}
```

```typescript
// ✅ Typed output()
@Directive({ selector: '[appDrag]' })
export class DragDirective {
  dropped = output<DragEvent>();

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent) {
    this.dropped.emit(e);
  }
}
```

```typescript
// ✅ outputFromObservable() for RxJS integration
import { outputFromObservable } from '@angular/core/rxjs-interop';

@Component({ selector: 'app-search', template: '...' })
export class SearchComponent {
  private searchSubject = new Subject<string>();
  search = outputFromObservable(
    this.searchSubject.pipe(debounceTime(300))
  );
}
```

---

## API Comparison

| Feature | `@Output() EventEmitter` | `output()` |
|---|---|---|
| Import needed | `Output`, `EventEmitter` | `output` |
| Emit value | `.emit(value)` | `.emit(value)` |
| RxJS stream output | Manual subject + subscribe | `outputFromObservable(obs$)` |
| Type | `EventEmitter<T>` | `OutputEmitterRef<T>` |

---

## Exemptions

- `@Output()` properties that are **not** `EventEmitter` instances (e.g., custom emitter classes) are not flagged.
- Properties that are part of an Input+Output pair should use [`model()`](./signal-prefer-model.md) instead.

---

## Migration Path

```typescript
// Before
@Output() save = new EventEmitter<FormData>();

onSave(data: FormData) {
  this.save.emit(data);
}

// After
save = output<FormData>();

onSave(data: FormData) {
  this.save.emit(data); // same API
}
```

---

## Related Rules

- [`signal-prefer-input-signal`](./signal-prefer-input-signal.md) — migrate `@Input()`
- [`signal-prefer-model`](./signal-prefer-model.md) — migrate Input+Output pairs
