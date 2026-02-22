# no-inner-html

**Severity:** `high`  **Phase:** 2 — Priority 1 (Security)  **Stream:** `TemplateAttribute`

## Rationale

Binding to `[innerHTML]` or `[outerHTML]` injects arbitrary HTML into the DOM. Even though Angular sanitises the value at runtime, the pattern invites XSS vulnerabilities when:

- User-supplied data reaches the binding
- Third-party integrations produce HTML strings
- Developers assume Angular sanitisation is infallible

The pattern `[innerHTML]="userContent"` is rarely necessary in modern Angular — template-driven rendering with `@if`, `@for`, and proper component decomposition is almost always a better structural alternative.

## Rule Details

Flags template attributes named `[innerHTML]`, `innerHTML`, `[outerHTML]`, or `outerHTML`.

### ❌ Failing

```html
<div [innerHTML]="htmlContent"></div>
<p [outerHTML]="markup"></p>
```

### ✅ Passing

```html
<!-- Use structural directives and components instead -->
<app-rich-text [content]="content" />

<!-- If HTML must be rendered, sanitise explicitly and document the decision -->
<div [innerHTML]="sanitizer.bypassSecurityTrustHtml(trustedHtml)"></div>
<!-- ^ This will be caught by no-bypass-security-trust for review -->
```

## Configuration

This rule has no configuration options.

## When To Disable

Email preview renderers, CMS-driven pages, or WYSIWYG editors where raw HTML injection is architecturally required and properly reviewed.

## See Also

- [`no-bypass-security-trust`](./no-bypass-security-trust.md)
- [Angular Security Guide](https://angular.dev/best-practices/security)
