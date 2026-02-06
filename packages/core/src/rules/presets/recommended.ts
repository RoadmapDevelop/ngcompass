import { PresetConfig } from "../types";

export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'Comprehensive recommended rules for modern Angular projects',
    rules: {
        // --- 1. MODERN ANGULAR (Signals & Control Flow) ---
        'prefer-signals': 'moderate',
        'prefer-standalone': 'high',
        'use-inject': 'moderate',
        'no-input-rename': 'low',
        'no-output-on-prefix': 'low',
        'component-selector': 'high',
        'directive-selector': 'high',
        'no-attribute-decorator': 'low',
        'template-prefer-self-closing-tags': 'low',
        'no-empty-lifecycle-method': 'moderate',
        'implements-on-destroy': 'high',
        'prefer-signal-inputs': 'moderate',
        'prefer-signal-queries': 'moderate',

        // --- 2. RxJS BEST PRACTICES ---
        'rxjs-no-async-subscribe': 'high',
        'rxjs-no-ignored-observable': 'high',
        'rxjs-no-nested-subscribe': 'high',
        'rxjs-no-unbound-methods': 'moderate',
        'rxjs-throw-error': 'low',
        'rxjs-no-subject-value': 'moderate',
        'rxjs-prefer-takeuntil': 'high',
        'rxjs-no-create': 'high',

        // --- 3. PERFORMANCE & MEMORY ---
        'no-slow-selectors': 'moderate',
        'prefer-on-push-component-change-detection': 'high',
        'no-output-native': 'high',
        'template-use-track-by-function': 'moderate',
        'no-conflicting-lifecycle': 'high',
        'no-expensive-getters': 'moderate',

        // --- 4. TEMPLATE & A11Y ---
        'template-no-any': 'high',
        'template-no-distracting-elements': 'moderate',
        'template-table-scope': 'low',
        'template-valid-aria-proptype': 'high',
        'template-no-positive-tabindex': 'low',
        'template-no-autofocus': 'moderate',
        'template-accessibility-alt-text': 'high',
        'template-no-negated-async': 'moderate',
        'template-prefer-control-flow': 'high',
        'template-no-duplicate-attributes': 'high',

        // --- 5. CODE HYGIENE & STYLE ---
        'no-var': 'high',
        'prefer-const': 'high',
        'no-unused-vars': 'moderate',
        'no-empty-interface': 'low',
        'no-inferrable-types': 'low',
        'no-magic-numbers': 'low',
        'member-ordering': 'moderate',
        'naming-convention-classes': 'moderate',
        'naming-convention-interfaces': 'moderate',
        'prefer-template-literals': 'low',
        'no-restricted-imports': 'moderate',
        'sort-imports': 'low',
        'no-shadow': 'moderate',
        'prefer-arrow-functions': 'low',

        // --- 6. SECURITY ---
        'no-inner-html': 'high',
        'no-security-sensitive-hook': 'high',
        'enforce-trusted-types': 'moderate',

        // --- 7. TESTING ---
        'no-focused-tests': 'high',
        'no-skipped-tests': 'moderate',
        'prefer-spyon': 'low',
        'no-jasmine-arrow': 'low',
    },
};
