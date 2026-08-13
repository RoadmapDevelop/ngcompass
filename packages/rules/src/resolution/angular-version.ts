import {
  isAngularVersionBelow,
  parseAngularVersion,
  type RuleMetadata,
} from '@ngcompass/common';
import type { VersionGateDecision } from '../models/index.js';

export const decideVersionGate = (
  metadata: RuleMetadata,
  detectedVersion: string | null,
  isExplicitlyConfigured: boolean
): VersionGateDecision => {
  const floor = metadata.minAngularVersion;
  if (floor === undefined) return 'run';

  const parsedFloor = parseAngularVersion(floor);
  if (parsedFloor === null) return 'invalid-floor';

  if (detectedVersion === null || isExplicitlyConfigured) return 'run';

  const parsedDetected = parseAngularVersion(detectedVersion);
  if (parsedDetected === null) return 'run';

  return isAngularVersionBelow(parsedDetected, parsedFloor) ? 'skip' : 'run';
};
