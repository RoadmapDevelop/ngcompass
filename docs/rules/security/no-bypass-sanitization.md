# no-bypass-sanitization

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Security |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

Angular's `DomSanitizer` provides `bypassSecurityTrust*` methods that mark a value as explicitly trusted, bypassing all sanitization. **This is a dangerous escape hatch** — if the value contains attacker-controlled content, it will execute in the user's browser as-is.

```
Normal flow (✅):
  User input → Angular sanitizer → safe HTML inserted into DOM

bypassSecurityTrust* flow (❌):
  User input → bypassSecurityTrustHtml() → unsafe HTML inserted into DOM
                         ↑
                No sanitization. If input contains <script> or onerror=,
                attacker code executes.
```

**Methods flagged by this rule:**

| Method | Risk |
|---|---|
| `bypassSecurityTrustHtml()` | Injects raw HTML — XSS via `<script>`, `onerror=`, etc. |
| `bypassSecurityTrustScript()` | Injects raw JavaScript |
| `bypassSecurityTrustStyle()` | Injects raw CSS — CSS injection, `expression()` attacks |
| `bypassSecurityTrustUrl()` | Injects raw URLs — `javascript:` protocol execution |
| `bypassSecurityTrustResourceUrl()` | Injects raw resource URLs — malicious iframes, scripts |

---

## Invalid Examples

```typescript
// ❌ Bypassing HTML sanitization
@Component({ template: '<div [innerHTML]="html"></div>' })
export class ArticleComponent {
  private sanitizer = inject(DomSanitizer);

  html = this.sanitizer.bypassSecurityTrustHtml(userInput); // ❌ error
}
```

```typescript
// ❌ Bypassing URL sanitization
@Component({ template: '<a [href]="link">Click</a>' })
export class LinkComponent {
  private sanitizer = inject(DomSanitizer);

  link = this.sanitizer.bypassSecurityTrustUrl(externalUrl); // ❌ error
}
```

```typescript
// ❌ Direct call (not on sanitizer instance)
const trusted = bypassSecurityTrustHtml(someHtml); // ❌ error
```

---

## Valid Examples

```typescript
// ✅ Use sanitize() — returns sanitized content
@Component({ template: '<div [innerHTML]="html"></div>' })
export class ArticleComponent {
  private sanitizer = inject(DomSanitizer);

  html = this.sanitizer.sanitize(SecurityContext.HTML, serverTrustedContent); // ✅
}
```

```typescript
// ✅ Avoid [innerHTML] entirely — use Angular data binding
@Component({
  template: `
    <p>{{ article.title }}</p>
    <p>{{ article.body }}</p>
  `
})
export class ArticleComponent {
  article = input.required<Article>(); // ✅ Angular auto-escapes interpolation
}
```

```typescript
// ✅ If bypass is unavoidable (trusted server content), document explicitly
// Only bypass if the HTML is server-generated and has never touched user input.
// NOTE: Reviewed and approved by security team on 2024-01-15.
const trustedHtml = this.sanitizer.bypassSecurityTrustHtml(
  serverGeneratedEmailTemplate  // Must be server-generated, never user-modified
);
```

> Even in the last example, consider disabling this rule locally and adding a comment — `bypassSecurityTrust*` should always be a conscious, reviewed decision.

---

## Safe Alternatives

| Use case | Safe alternative |
|---|---|
| Render server-generated HTML | `sanitizer.sanitize(SecurityContext.HTML, content)` |
| Embed a video URL | `sanitizer.sanitize(SecurityContext.RESOURCE_URL, url)` |
| Display user text | `{{ userText }}` — interpolation auto-escapes |
| Style from server | `[style.color]="serverColor"` — Angular sanitizes CSS values |
| Link from server | `[href]="url"` — Angular sanitizes `javascript:` protocol |

---

## Exemptions

There are **no exemptions**. Every `bypassSecurityTrust*` call is flagged. If you must use these methods, address the finding by:

1. Confirming the value is from a trusted source (server-generated, not user input).
2. Documenting the security review inline.
3. Suppressing the rule at the specific line if your tooling supports it.

---

## Related Rules

- [`template-no-unsafe-bindings`](./template-no-unsafe-bindings.md) — prevent `[innerHTML]` without sanitization
