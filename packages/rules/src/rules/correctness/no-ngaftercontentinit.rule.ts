import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgAfterContentInitRule = createLifecycleHookRule(
  'no-ngaftercontentinit',
  'ngAfterContentInit',
  'Avoid ngAfterContentInit; use signals and computed() for projected content state instead.'
);
