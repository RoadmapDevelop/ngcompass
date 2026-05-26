import { PresetConfig } from '@ngcompass/common';

export const strictPreset: PresetConfig = {
  name: 'ngcompass:strict',
  description: 'All rules at error severity — zero tolerance mode',
  rules: {
    'component-no-manual-detect-changes': 'error',
    'rxjs-no-nested-subscribe': 'error',
    'signal-no-side-effects-in-computed': 'error',
    'signal-effect-must-be-destroy-scoped': 'error',

    'prefer-on-push-component-change-detection': 'error',

    'prefer-inject-over-constructor-di': 'error',

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

    'no-bypass-sanitization': 'error',
    'template-no-unsafe-bindings': 'error',

    'no-document-access': 'error',
    'prefer-after-render-over-after-view-init': 'error',

    'spec-no-focused-test': 'error',
  },
};
