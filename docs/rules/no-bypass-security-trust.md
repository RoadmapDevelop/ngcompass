# no-bypass-security-trust

**Severity:** `high`  **Phase:** 2 — Priority 1 (Security)  **Stream:** `AngularClass`

## Rationale

`DomSanitizer.bypassSecurityTrust*()` methods explicitly disable Angular's XSS sanitisation. Their use must be:

1. Extremely rare
2. Code-reviewed
3. Documented with the reason why the value is provably safe

This rule flags any call to the following methods so they receive mandatory attention:

| Method | Disables sanitisation for |
|---|---|
| `bypassSecurityTrustHtml` | HTML binding (`[innerHTML]`) |
| `bypassSecurityTrustStyle` | Style binding |
| `bypassSecurityTrustScript` | Script content |
| `bypassSecurityTrustUrl` | URL binding (`href`, `src`) |
| `bypassSecurityTrustResourceUrl` | Resource URL (`src` in iframes, scripts) |

## Rule Details

### ❌ Failing

```ts
@Component({ ... })
export class ArticleComponent {
    getSafeHtml(html: string) {
        return this.sanitizer.bypassSecurityTrustHtml(html);  // ← flagged
    }
}
```

### ✅ Passing

```ts
// If truly necessary, add an eslint-disable with justification:
// ngcompass-disable-next-line no-bypass-security-trust -- Content comes from our own CMS, validated server-side
return this.sanitizer.bypassSecurityTrustHtml(trustedHtml);
```

Or restructure so the HTML is never injected:
```ts
// Use component composition instead of raw HTML injection
<app-article-body [sections]="article.sections" />
```

## Configuration

This rule has no configuration options.

## When To Disable

When value comes from a fully controlled server-side source (e.g., sanitised CMS content), add an inline disable comment with justification.

## See Also

- [`no-inner-html`](./no-inner-html.md)
- [Angular DomSanitizer docs](https://angular.dev/api/platform-browser/DomSanitizer)
