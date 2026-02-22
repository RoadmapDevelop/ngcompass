# template-no-inline-styles

**Severity:** `low`  **Phase:** 2 — Priority 3 (Template Coverage)  **Stream:** `TemplateAttribute`

## Rationale

Inline style bindings (`[ngStyle]`, `[style]` object binding) mix presentation and logic, making:
- Theme switching harder (styles are scattered in templates, not stylesheets)
- CSS design tokens harder to adopt
- Templates harder to read

Individual property bindings (`[style.color]="color"`) are **not** flagged — they are often the right tool for dynamic single-property values.

## Rule Details

Flags:
- `[ngStyle]` directive usage
- `[style]` object binding (binding the whole style object, not a single property)

### ❌ Failing

```html
<div [ngStyle]="{ color: textColor, fontSize: fontSize + 'px' }">...</div>
<p [style]="styleObject">...</p>
```

### ✅ Passing

```html
<!-- Individual property bindings are fine -->
<div [style.color]="textColor" [style.font-size.px]="fontSize">...</div>

<!-- Better: use CSS classes -->
<div [class.highlighted]="isHighlighted" [class.large]="isLarge">...</div>
```

## Configuration

This rule has no configuration options.

## When To Disable

In rare cases where a style object must be applied dynamically (e.g., drag-and-drop position tracking) and individual property bindings are impractical.

## See Also

- [Angular Style Binding](https://angular.dev/guide/templates/binding#styling-elements)
