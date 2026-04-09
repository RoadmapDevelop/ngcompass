# rxjs-no-subscribe-in-component

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Reactivity |
| **Applies to** | `.component.ts` |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

Calling `.subscribe()` inside a component creates a subscription that the component must manage manually. Forgetting to unsubscribe causes **memory leaks** — the subscription (and the component) live beyond the component's destruction, holding references to the DOM and the application state.

This rule distinguishes between two legitimate subscription patterns:

```
Subscription types:
────────────────────────────────────────────────────────────────
 Type A: Reactive state (data that flows into the template)
   ❌ this.data$.subscribe(d => this.data = d)
   ✅ data = toSignal(this.data$, { initialValue: null })
   ✅ template: {{ data$ | async }}

 Type B: Imperative action (one-shot user-triggered side effect)
   ✅ onSave() { this.api.save(data).subscribe(r => notify(r)) }
      ↑ HTTP auto-completes — no leak risk

 Type C: Long-lived stream (WebSocket, polling, event bus)
   ✅ this.ws$.pipe(takeUntilDestroyed()).subscribe(...)
      ↑ takeUntilDestroyed() cleans up automatically
```

---

## Invalid Examples

```typescript
// ❌ Bare subscribe — no teardown, potential memory leak
@Component({ selector: 'app-list', template: '{{ data | json }}' })
export class ListComponent implements OnInit {
  data: Item[] = [];

  ngOnInit() {
    this.dataService.items$.subscribe(items => { // ❌ error
      this.data = items;
    });
  }
}
```

```typescript
// ❌ Subscribe to a WebSocket stream without teardown
ngOnInit() {
  this.ws.messages$.subscribe(msg => this.handle(msg)); // ❌ error
}
```

---

## Valid Examples

```typescript
// ✅ toSignal() — reactive state, no subscription code needed
@Component({
  template: '{{ items() | json }}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent {
  items = toSignal(inject(DataService).items$, { initialValue: [] });
}
```

```typescript
// ✅ async pipe — subscription managed by Angular
@Component({ template: '{{ items$ | async | json }}' })
export class ListComponent {
  items$ = inject(DataService).items$;
}
```

```typescript
// ✅ HTTP one-shot — auto-completes, acceptable in imperative handler
@Component({ template: '...' })
export class FormComponent {
  private api = inject(ApiService);

  onSave(data: FormData) {
    this.api.save(data).subscribe(result => this.notify(result)); // ✅ HTTP completes
  }
}
```

```typescript
// ✅ Long-lived stream with takeUntilDestroyed
@Component({ template: '...' })
export class ChatComponent {
  private ws = inject(WebSocketService);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.ws.messages$.pipe(
      takeUntilDestroyed(this.destroyRef) // ✅ auto-cleanup
    ).subscribe(msg => this.handle(msg));
  }
}
```

---

## Exemptions

| Pattern | Exempt? | Reason |
|---|---|---|
| `.pipe(take(1)).subscribe()` | ✅ | Single emission — auto-completes |
| `.pipe(first()).subscribe()` | ✅ | Single emission — auto-completes |
| HTTP observable pattern | ✅ | `this.http.get()`, `this.api.getUser()`, etc. auto-complete |
| `.pipe(takeUntilDestroyed(...))` | ✅ | Explicit lifecycle teardown |
| `.pipe(takeUntil(...))` | ✅ | Explicit teardown subject |
| Manual `ngOnDestroy + .unsubscribe()` | ✅ | Manual management detected |

---

## Related Rules

- [`rxjs-require-take-until-destroyed`](./rxjs-require-take-until-destroyed.md) — enforce teardown
- [`to-signal-require-initial-value`](./to-signal-require-initial-value.md)
- [`rxjs-prefer-to-signal-for-template-state`](./rxjs-prefer-to-signal-for-template-state.md)
