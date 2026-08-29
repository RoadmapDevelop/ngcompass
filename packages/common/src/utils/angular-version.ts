import type { AngularVersionTuple } from '../models/angular-version.js';

const ANGULAR_VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.\d+)?(?:[-+].*)?$/;

export const parseAngularVersion = (
  value: string
): AngularVersionTuple | null => {
  const match = ANGULAR_VERSION_PATTERN.exec(value.trim());
  if (!match) return null;

  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return [major, minor];
};

export const isAngularVersionBelow = (
  candidate: AngularVersionTuple,
  floor: AngularVersionTuple
): boolean => {
  if (candidate[0] !== floor[0]) return candidate[0] < floor[0];
  return candidate[1] < floor[1];
};

export const formatAngularVersion = (version: AngularVersionTuple): string =>
  `${version[0]}.${version[1]}`;
