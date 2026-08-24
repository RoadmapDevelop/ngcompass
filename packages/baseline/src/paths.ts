import path from 'node:path';

export function toBaselineKey(absolutePath: string, rootDir: string): string {
  const relative = path.relative(rootDir, absolutePath);
  return relative.replace(/\\/g, '/');
}

export function toBaselineKeys(
  absolutePaths: ReadonlyArray<string>,
  rootDir: string
): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < absolutePaths.length; i++) {
    keys.add(toBaselineKey(absolutePaths[i], rootDir));
  }
  return keys;
}

export function baseNameOf(key: string): string {
  const slash = key.lastIndexOf('/');
  return slash === -1 ? key : key.slice(slash + 1);
}
