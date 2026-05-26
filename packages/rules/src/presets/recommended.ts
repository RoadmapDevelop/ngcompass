import { PresetConfig } from '@ngcompass/common';

export const recommendedPreset: PresetConfig = {
  name: 'ngcompass:recommended',
  description:
    'High-confidence rules that prevent real bugs and regressions in any Angular project',
  rules: {
    'component-no-manual-detect-changes': 'error',
    'rxjs-no-nested-subscribe': 'error',
    'signal-no-side-effects-in-computed': 'error',
    'signal-effect-must-be-destroy-scoped': 'error',

    'rxjs-no-subscribe-in-component': 'error',
    'rxjs-require-takeUntilDestroyed': 'error',

    'prefer-on-push-component-change-detection': 'error',

    'template-no-call-expression': 'error',
    'template-trackby-required': 'error',
    'template-no-object-literal-binding': 'warn',
    'template-no-array-literal-binding': 'warn',
    'template-no-async-pipe-duplication': 'warn',

    'no-bypass-sanitization': 'error',
    'template-no-unsafe-bindings': 'error',

    'spec-no-focused-test': 'error',
  },
};
