import { PresetConfig } from '@ngcompass/common';

export const performancePreset: PresetConfig = {
  name: 'ngcompass:performance',
  description:
    'Rules that directly impact Angular rendering and change-detection performance',
  rules: {
    'prefer-on-push-component-change-detection': 'error',
    'component-no-manual-detect-changes': 'error',

    'template-no-call-expression': 'error',
    'template-trackby-required': 'error',
    'template-no-object-literal-binding': 'warn',
    'template-no-array-literal-binding': 'warn',
    'template-no-async-pipe-duplication': 'warn',

    'rxjs-prefer-toSignal-for-template-state': 'warn',
  },
};
