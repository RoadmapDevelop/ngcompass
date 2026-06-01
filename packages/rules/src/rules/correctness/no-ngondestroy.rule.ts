import { createLifecycleHookRule } from './zoneless-lifecycle-utils';

export const noNgOnDestroyRule = createLifecycleHookRule(
  'no-ngondestroy',
  'ngOnDestroy',
  'Avoid ngOnDestroy; signals and resources auto-destroy. Use DestroyRef.onDestroy() for the rare manual cleanup.'
);
