import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgOnChangesRule = createLifecycleHookRule(
  'no-ngonchanges',
  'ngOnChanges',
  'Avoid ngOnChanges; derive state from input() signals with computed() instead in a zoneless application.'
);
