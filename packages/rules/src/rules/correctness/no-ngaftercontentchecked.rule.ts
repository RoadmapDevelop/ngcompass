import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgAfterContentCheckedRule = createLifecycleHookRule(
  'no-ngaftercontentchecked',
  'ngAfterContentChecked',
  'Avoid ngAfterContentChecked; use signals and computed() for projected content state instead.'
);
