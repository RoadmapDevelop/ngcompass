import { PresetConfig } from '@ngcompass/common';

export const zonelessPreset: PresetConfig = {
  name: 'ngcompass:zoneless',
  description:
    'Rules to enforce zoneless best practices, signals, and no-ngzone in Angular applications',
  rules: {
    'no-ngzone': 'error',
    'template-no-async-pipe': 'error',

    'prefer-on-push-component-change-detection': 'error',
    'signal-prefer-input-signal': 'error',
    'signal-prefer-output-function': 'error',
    'rxjs-no-subscribe-in-component': 'error',

    'no-changedetectorref': 'error',
    'no-content-decorator': 'error',
    'no-detectchanges-testing': 'error',
    'no-directive-accessor': 'error',
    'no-ngaftercontentchecked': 'error',
    'no-ngaftercontentinit': 'error',
    'no-ngafterviewchecked': 'error',
    'no-ngafterviewinit': 'error',
    'no-ngdocheck': 'error',
    'no-ngonchanges': 'error',
    'no-ngondestroy': 'error',
    'no-ngoninit': 'error',
    'no-ngzone-testing': 'error',
    'no-providezonechangedetection': 'error',
    'no-view-decorator': 'error',
    'no-zonejs-import': 'error',
    'no-zonejs-testing-functions': 'error',
  },
};
