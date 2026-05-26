import { PresetConfig } from '@ngcompass/common';

export const reactivityPreset: PresetConfig = {
  name: 'ngcompass:reactivity',
  description:
    'Signals correctness and RxJS → Signals migration rules for Angular 17+ projects',
  rules: {
    'rxjs-no-nested-subscribe': 'error',
    'rxjs-no-subscribe-in-component': 'error',
    'rxjs-require-takeUntilDestroyed': 'error',
    'rxjs-avoid-subject-as-event-bus': 'warn',

    'rxjs-prefer-toSignal-for-template-state': 'warn',
    'toSignal-require-initialValue': 'warn',

    'signal-no-side-effects-in-computed': 'error',
    'signal-effect-must-be-destroy-scoped': 'error',
    'signal-prefer-computed-over-sync-effect': 'warn',
    'signal-avoid-untracked-overuse': 'warn',

    'signal-prefer-input-signal': 'warn',
    'signal-prefer-output-function': 'warn',
    'signal-prefer-model': 'warn',
  },
};
