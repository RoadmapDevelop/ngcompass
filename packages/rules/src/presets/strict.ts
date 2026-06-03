import { PresetConfig } from '@ngcompass/common';

export const strictPreset: PresetConfig = {
  name: 'ngcompass:strict',
  description: 'High-confidence rules at error severity',
  rules: {
    'component-no-manual-detect-changes': 'error',
    'rxjs-no-nested-subscribe': 'error',
    'signal-no-side-effects-in-computed': 'error',
    'signal-effect-must-be-destroy-scoped': 'error',
    'no-ngzone': 'error',

    'prefer-on-push-component-change-detection': 'error',

    'rxjs-no-subscribe-in-component': 'error',
    'rxjs-require-takeUntilDestroyed': 'error',
    'rxjs-avoid-subject-as-event-bus': 'error',
    'rxjs-prefer-toSignal-for-template-state': 'error',
    'toSignal-require-initialValue': 'error',

    'signal-prefer-computed-over-sync-effect': 'error',
    'signal-avoid-untracked-overuse': 'error',
    'signal-prefer-input-signal': 'error',
    'signal-prefer-output-function': 'error',
    'signal-prefer-model': 'error',

    'template-no-call-expression': 'error',
    'template-trackby-required': 'error',
    'template-no-object-literal-binding': 'error',
    'template-no-array-literal-binding': 'error',
    'template-no-async-pipe-duplication': 'error',
    'template-prefer-control-flow': 'error',
    'template-no-async-pipe': 'error',

    'no-bypass-sanitization': 'error',
    'template-no-unsafe-bindings': 'error',

    'no-document-access': 'error',
    'prefer-after-render-over-after-view-init': 'error',

    'spec-no-focused-test': 'error',
  },
};
