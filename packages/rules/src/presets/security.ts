import { PresetConfig } from '@ngcompass/common';

export const securityPreset: PresetConfig = {
  name: 'ngcompass:security',
  description: 'XSS and sanitization bypass prevention rules',
  rules: {
    'no-bypass-sanitization': 'error',
    'template-no-unsafe-bindings': 'error',
  },
};
