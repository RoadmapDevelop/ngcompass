import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgAfterViewCheckedRule = createLifecycleHookRule(
  'no-ngafterviewchecked',
  'ngAfterViewChecked',
  'Avoid ngAfterViewChecked; use signals and computed() for derived view state instead.'
);
