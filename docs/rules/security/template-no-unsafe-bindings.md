# template-no-unsafe-bindings

| Property | Value |
|---|---|
| **Severity** | `error` (`[innerHTML]`, `[outerHTML]`, `[srcdoc]`) · `warn` (`[style]` complex) |
| **Category** | Security |
| **Applies to** | Template files |
| **Stream** | `TemplateAttribute` |

---

## Why This Rule Exists

Certain HTML property bindings are **inherently dangerous** when they receive unsanitized values. Angular's template syntax is safe by default (interpolation escapes HTML), but property bindings bypass that protection:

```
{{ userInput }}                  ← safe — Angular HTML-escapes this
[innerHTML]="userInput"          ← UNSAFE — renders raw HTML as-is
```

If `userInput` contains `<script>alert(1)</script>` or `<img onerror="stealCookies()">`, it **executes in the user's browser**.

**Bindings checked by this rule:**

| Binding | Risk | Severity |
|---|---|---|
| `[innerHTML]` | Renders raw HTML — XSS via scripts or event handlers | `error` |
| `[outerHTML]` | Replaces the element with raw HTML | `error` |
| `[srcdoc]` | Embeds raw HTML in an `<iframe>` — same-origin script execution | `error` |
| `[style]` with complex expression | CSS injection via method calls / pipes | `warn` |

---

## Invalid Examples

```html
<!-- ❌ Direct unsanitized binding -->
<div [innerHTML]="userComment"></div>

<!-- ❌ No sanitization pipe -->
<div [outerHTML]="rawHtml"></div>

<!-- ❌ iframe with user content -->
<iframe [srcdoc]="userContent"></iframe>

<!-- ❌ Complex [style] binding — CSS injection risk -->
<div [style]="getInlineStyles(item)"></div>
```

---

## Valid Examples

```html
<!-- ✅ Sanitization pipe applied -->
<div [innerHTML]="content | safeHtml"></div>

<!-- ✅ Using sanitize pipe -->
<div [innerHTML]="content | sanitize"></div>

<!-- ✅ Sanitization method in the expression -->
<div [innerHTML]="getSafeHtml(content)"></div>

<!-- ✅ Simple [style] binding — not a CSS injection vector -->
<div [style.color]="textColor"></div>
<div [style]="backgroundColor"></div>
```

```typescript
// ✅ Component sanitizes using DomSanitizer
@Component({ template: '<div [innerHTML]="safeContent"></div>' })
export class ArticleComponent {
  private sanitizer = inject(DomSanitizer);

  content = input.required<string>();

  safeContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.content()) ?? ''
  );
}
```

---

## Sanitization Detection

The rule considers a binding **sanitized** when the value contains:

**Recognized sanitization pipes:**
`safeHtml` · `safeStyle` · `safeUrl` · `safeResourceUrl` · `sanitize` · `sanitizeHtml` · `sanitizeUrl` · `trustHtml` · `trustStyle` · `trustUrl` · `trustResourceUrl` · `bypassSecurity`

**Recognized sanitization methods:**
`getSafeHtml()` · `getSafeUrl()` · `getSafeStyle()` · `getSafeResourceUrl()` · `sanitize()` · `sanitizeHtml()` · `sanitizeUrl()` · `trustHtml()` · `bypassSecurity()`

> **Note:** The rule cannot perform data-flow analysis to verify the value is truly safe. Providing a recognized pipe or method call is sufficient to suppress the warning. Ensure these helpers actually sanitize.

---

## `[style]` Binding Details

The `[style]` binding only generates a `warn` (not `error`) when the value is complex:

| Expression | Flagged? | Reason |
|---|---|---|
| `[style]="backgroundColor"` | ❌ Not flagged | Simple property access — safe |
| `[style]="getStyle(item)"` | ✅ Flagged (`warn`) | Method call — potential CSS injection |
| `[style]="active ? styles.a : styles.b"` | ✅ Flagged (`warn`) | Ternary — complex expression |
| `[style.color]="textColor"` | ❌ Not flagged | Typed property binding — safe |

---

## Exemptions

| Condition | Exempt? |
|---|---|
| Recognized sanitization pipe in value | ✅ |
| Recognized sanitization method in value | ✅ |
| `[style]` with simple identifier value | ✅ |

---

## Related Rules

- [`no-bypass-sanitization`](./no-bypass-sanitization.md) — prevent `bypassSecurityTrust*` calls in TypeScript
