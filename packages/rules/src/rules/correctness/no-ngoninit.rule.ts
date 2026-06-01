import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgOnInitRule = createLifecycleHookRule(
  'no-ngoninit',
  'ngOnInit',
  'Avoid ngOnInit; resources and signals are reactive, so manual init phases are not needed in a zoneless application.'
);
