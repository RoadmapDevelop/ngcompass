const ANGULAR_VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.\d+)?(?:[-+].*)?$/;

export type AngularVersionTuple = readonly [number, number];

export function parseAngularVersion(value: string): AngularVersionTuple | null {
  const match = ANGULAR_VERSION_PATTERN.exec(value.trim());
  if (!match) return null;

  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return [major, minor];
}

export function isAngularVersionBelow(
  candidate: AngularVersionTuple,
  floor: AngularVersionTuple
): boolean {
  if (candidate[0] !== floor[0]) return candidate[0] < floor[0];
  return candidate[1] < floor[1];
}

export function formatAngularVersion(version: AngularVersionTuple): string {
  return `${version[0]}.${version[1]}`;
}
