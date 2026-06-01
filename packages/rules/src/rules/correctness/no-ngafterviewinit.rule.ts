import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgAfterViewInitRule = createLifecycleHookRule(
  'no-ngafterviewinit',
  'ngAfterViewInit',
  'Avoid ngAfterViewInit; use afterNextRender() for one-shot DOM access or signals for derived view state.'
);
