import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgDoCheckRule = createLifecycleHookRule(
  'no-ngdocheck',
  'ngDoCheck',
  'Avoid ngDoCheck; signals already track change detection automatically in a zoneless application.'
);
