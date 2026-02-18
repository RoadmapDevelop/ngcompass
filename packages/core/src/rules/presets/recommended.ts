import { PresetConfig } from "../types";

/**
 * Recommended Preset
 *
 * Only includes rules that have a working implementation registered
 * via `register-all.ts`. Unimplemented rules are listed in the
 * ROADMAP section below so they are easy to promote once built.
 */
export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'Recommended rules for modern Angular projects (implemented only)',
    rules: {
        // ── P0: Migration Blockers ──────────────────────────
        'prefer-on-push-component-change-detection': 'high',
        'prefer-standalone': 'low',
        'prefer-signal-inputs': 'moderate',
        'template-no-call-expression': 'high',
        'template-prefer-control-flow': 'high',

        // ── P1: High-ROI Quick Wins ─────────────────────────
        'rxjs-no-nested-subscribe': 'high',
        'template-use-track-by-function': 'moderate',
        'no-input-rename': 'moderate',
        'component-selector': 'moderate',
        'directive-selector': 'high',
        'rxjs-prefer-takeuntil': 'high',
    },
};

/**
 * ── ROADMAP ─────────────────────────────────────────────────
 * Rules below are planned but NOT yet implemented.
 * Promote them into `recommendedPreset.rules` once their
 * rule handler is registered in `register-all.ts`.
 *
 * Modern Angular:
 *   'use-inject': 'moderate'
 *   'no-output-on-prefix': 'low'
 *   'no-attribute-decorator': 'low'
 *   'template-prefer-self-closing-tags': 'low'
 *   'no-empty-lifecycle-method': 'moderate'
 *   'implements-on-destroy': 'high'
 *   'prefer-signal-queries': 'moderate'
 *
 * RxJS:
 *   'rxjs-no-async-subscribe': 'high'
 *   'rxjs-no-ignored-observable': 'high'
 *   'rxjs-no-unbound-methods': 'moderate'
 *   'rxjs-throw-error': 'low'
 *   'rxjs-no-subject-value': 'moderate'
 *   'rxjs-no-create': 'high'
 *
 * Performance & Memory:
 *   'no-slow-selectors': 'moderate'
 *   'no-output-native': 'high'
 *   'no-conflicting-lifecycle': 'high'
 *   'no-expensive-getters': 'moderate'
 *
 * Template & A11Y:
 *   'template-no-any': 'high'
 *   'template-no-distracting-elements': 'moderate'
 *   'template-table-scope': 'low'
 *   'template-valid-aria-proptype': 'high'
 *   'template-no-positive-tabindex': 'low'
 *   'template-no-autofocus': 'moderate'
 *   'template-accessibility-alt-text': 'high'
 *   'template-no-negated-async': 'moderate'
 *   'template-no-duplicate-attributes': 'high'
 *
 * Code Hygiene & Style:
 *   'no-var': 'high'
 *   'prefer-const': 'high'
 *   'no-unused-vars': 'moderate'
 *   'no-empty-interface': 'low'
 *   'no-inferrable-types': 'low'
 *   'no-magic-numbers': 'low'
 *   'member-ordering': 'moderate'
 *   'naming-convention-classes': 'moderate'
 *   'naming-convention-interfaces': 'moderate'
 *   'prefer-template-literals': 'low'
 *   'no-restricted-imports': 'moderate'
 *   'sort-imports': 'low'
 *   'no-shadow': 'moderate'
 *   'prefer-arrow-functions': 'low'
 *
 * Security:
 *   'no-inner-html': 'high'
 *   'no-security-sensitive-hook': 'high'
 *   'enforce-trusted-types': 'moderate'
 *
 * Testing:
 *   'no-focused-tests': 'high'
 *   'no-skipped-tests': 'moderate'
 *   'prefer-spyon': 'low'
 *   'no-jasmine-arrow': 'low'
 */
