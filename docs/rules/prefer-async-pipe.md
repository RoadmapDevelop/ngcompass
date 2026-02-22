# prefer-async-pipe

**Severity:** `low`  **Phase:** 2 — Priority 3 (Template Coverage)  **Stream:** `AngularClass`

## Rationale

When a component subscribes to an Observable inside `ngOnInit` and assigns the result to a property, the `async` pipe is almost always a cleaner alternative:

| Manual subscribe | async pipe |
|---|---|
| Requires `ngOnDestroy` + `takeUntil` | No cleanup needed |
| Stores intermediate state | State lives in the template |
| Harder to see what drives the template | Template is declarative |

## Rule Details

Flags `.subscribe()` calls inside `ngOnInit` whose callback assigns to a `this.xxx` property — the classic "manual subscription to feed a template property" pattern.

### ❌ Failing

```ts
@Component({ ... })
export class UserListComponent implements OnInit {
    users: User[] = [];

    ngOnInit() {
        this.userService.getUsers().subscribe(users => {
            this.users = users;   // ← flagged
        });
    }
}
```

```html
<ul>
    @for (user of users; track user.id) { <li>{{ user.name }}</li> }
</ul>
```

### ✅ Passing

```ts
@Component({ ... })
export class UserListComponent {
    users$ = this.userService.getUsers();
    constructor(private userService: UserService) {}
}
```

```html
<ul>
    @for (user of users$ | async; track user.id) { <li>{{ user.name }}</li> }
</ul>
```

## Configuration

This rule has no configuration options.

## When To Disable

When the subscription has side effects beyond setting a template property (e.g., routing, logging), the async pipe is not appropriate. Disable for that specific subscription.

## See Also

- [Angular AsyncPipe](https://angular.dev/api/common/AsyncPipe)
- [`rxjs-prefer-takeuntil`](./rxjs-prefer-takeuntil.md)
