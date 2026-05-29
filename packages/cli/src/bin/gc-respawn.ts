import { spawnSync } from 'node:child_process';
import process from 'node:process';

const RESPAWN_GUARD_ENV = 'NGCOMPASS_GC_RESPAWNED';
const ANALYZE_COMMAND = 'analyze';
const HELP_VERSION_FLAGS = new Set(['--version', '-V', '--help', '-h']);

const isGarbageCollectionExposed = (): boolean =>
  typeof (globalThis as { gc?: () => void }).gc === 'function';

const isAnalyzeInvocation = (args: ReadonlyArray<string>): boolean => {
  if (!args.includes(ANALYZE_COMMAND)) return false;
  for (const arg of args) {
    if (HELP_VERSION_FLAGS.has(arg)) return false;
  }
  return true;
};

export function maybeRespawnWithExposeGc(): void {
  if (isGarbageCollectionExposed()) return;
  if (process.env[RESPAWN_GUARD_ENV] === '1') return;

  const args = process.argv.slice(2);
  if (!isAnalyzeInvocation(args)) return;

  const scriptPath = process.argv[1];
  if (!scriptPath) return;

  const result = spawnSync(
    process.execPath,
    ['--expose-gc', ...process.execArgv, scriptPath, ...args],
    {
      stdio: 'inherit',
      env: { ...process.env, [RESPAWN_GUARD_ENV]: '1' },
    }
  );

  process.exit(result.status ?? 1);
}
