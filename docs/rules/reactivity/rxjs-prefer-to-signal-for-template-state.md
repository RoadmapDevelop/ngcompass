# rxjs-prefer-to-signal-for-template-state

| Property | Value |
|---|---|
| **Rule name** | `rxjs-prefer-toSignal-for-template-state` |
| **Severity** | `warn` |
| **Category** | Reactivity |
| **Applies to** | `.component.ts` |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

When an Observable is only used in the template (via `async` pipe), converting it to a signal with `toSignal()` offers several advantages:

- **Cleaner template syntax** — `{{ data() }}` vs `{{ data$ | async }}`
- **No `| async` subscription overhead** — the signal holds the latest value directly
- **Reactive compatibility** — signals integrate with `computed()` and `effect()`
- **Zoneless-ready** — `async` pipe is Zone-dependent; signals work in zoneless apps
- **Type safety** — with `initialValue`, the signal type eliminates `| undefined`

This rule detects Observable properties ending in `$` that are referenced in the template by their base name (without the `$`), which is the conventional signal-access pattern.

---

## Invalid Examples

```typescript
// ❌ Observable used directly in template with async pipe
@Component({
  template: `
    <div *ngIf="users$ | async as users">
      @for (u of users; track u.id) { <p>{{ u.name }}</p> }
    </div>
  `
})
export class UserListComponent {
  users$ = this.userService.getUsers(); // ⚠️ warn — template uses `users$ | async`
}
```

```typescript
// ❌ BehaviorSubject exposed to template
@Component({ template: '<p>{{ status$ | async }}</p>' })
export class StatusComponent {
  status$ = new BehaviorSubject<string>('idle'); // ⚠️ warn
}
```

---

## Valid Examples

```typescript
// ✅ toSignal() — reactive, type-safe, no async pipe
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (users()) {
      @for (u of users()!; track u.id) { <p>{{ u.name }}</p> }
    }
  `
})
export class UserListComponent {
  private userService = inject(UserService);

  users = toSignal(this.userService.getUsers(), { initialValue: [] });
}
```

```typescript
// ✅ Already a signal — no conversion needed
@Component({ template: '<p>{{ status() }}</p>' })
export class StatusComponent {
  status = signal('idle'); // ✅ already a signal
}
```

```typescript
// ✅ Observable used in class logic only — not template-visible
@Component({ template: '<button (click)="save()">Save</button>' })
export class FormComponent {
  private saveResult$ = new Subject<Result>(); // ✅ not in template, not flagged

  save() {
    this.api.save().subscribe(r => this.saveResult$.next(r));
  }
}
```

---

## Detection Logic

The rule cross-references:
1. Properties ending with `$` in the component class.
2. Template references found in the template file.

It flags when the property base name (without `$`) appears in the template, suggesting the observable is being subscribed to via `async` pipe.

```
Component:           Template (inferred):
users$ property  →   users referenced  →  flag!
status$          →   status referenced →  flag!
action$ (method) →   not referenced    →  safe
```

---

## Exemptions

| Pattern | Exempt? |
|---|---|
| `@Output()` decorated properties | ✅ |
| Properties already wrapped in `toSignal()` | ✅ |
| Properties already wrapped in `signal()` or `computed()` | ✅ |
| Teardown subjects (`destroy$`, etc.) | ✅ |
| Observable not referenced in template | ✅ |
| Properties without `$` suffix | ✅ (not checked) |

---

## Migration

```typescript
// Before
data$ = this.http.get<Data[]>('/api/data').pipe(shareReplay(1));
// template: {{ data$ | async | json }}

// After
data = toSignal(
  this.http.get<Data[]>('/api/data'),
  { initialValue: [] as Data[] }
);
// template: {{ data() | json }}
```

---

## Related Rules

- [`to-signal-require-initial-value`](./to-signal-require-initial-value.md)
- [`rxjs-no-subscribe-in-component`](./rxjs-no-subscribe-in-component.md)
