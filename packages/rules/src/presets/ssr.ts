import { PresetConfig } from '@ngcompass/common';

export const ssrPreset: PresetConfig = {
  name: 'ngcompass:ssr',
  description: 'Platform safety rules for Angular SSR / Universal applications',
  rules: {
    'no-document-access': 'warn',
    'prefer-after-render-over-after-view-init': 'warn',
  },
};
