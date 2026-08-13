import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import process from 'node:process';

import type { RespawnOutcome } from '../models/index.js';
const RESPAWN_GUARD_ENV = 'NGCOMPASS_GC_RESPAWNED';
const ANALYZE_COMMAND = 'analyze';
const HELP_VERSION_FLAGS = new Set(['--version', '-V', '--help', '-h']);
const STARTUP_FAILURE_WINDOW_MS = 5000;
const RESPAWN_CRASH_EXIT_CODE = 1;
const RESPAWN_FALLBACK_NOTICE =
  '[ngcompass] Could not relaunch with --expose-gc (likely low memory); continuing without proactive garbage-collection hints.';
const RESPAWN_CRASH_NOTICE =
  '[ngcompass] Analysis crashed (likely out of memory); re-run with --skip-type-check or raise --max-old-space-size.';

const isGarbageCollectionExposed = (): boolean =>
  'gc' in globalThis && typeof globalThis.gc === 'function';

const isAnalyzeInvocation = (args: ReadonlyArray<string>): boolean => {
  if (!args.includes(ANALYZE_COMMAND)) return false;
  for (const arg of args) {
    if (HELP_VERSION_FLAGS.has(arg)) return false;
  }
  return true;
};

export function resolveRespawnOutcome(
  result: Pick<SpawnSyncReturns<Buffer>, 'error' | 'signal' | 'status'>,
  elapsedMs: number
): RespawnOutcome {
  if (result.error) {
    return { kind: 'fallback' };
  }
  if (result.signal !== null || result.status === null) {
    if (elapsedMs <= STARTUP_FAILURE_WINDOW_MS) {
      return { kind: 'fallback' };
    }
    return { kind: 'crash', code: RESPAWN_CRASH_EXIT_CODE };
  }
  return { kind: 'exit', code: result.status };
}

export function maybeRespawnWithExposeGc(): void {
  if (isGarbageCollectionExposed()) return;
  if (process.env[RESPAWN_GUARD_ENV] === '1') return;

  const args = process.argv.slice(2);
  if (!isAnalyzeInvocation(args)) return;

  const scriptPath = process.argv[1];
  if (!scriptPath) return;

  const startedAt = performance.now();
  const result = spawnSync(
    process.execPath,
    ['--expose-gc', ...process.execArgv, scriptPath, ...args],
    {
      stdio: 'inherit',
      env: { ...process.env, [RESPAWN_GUARD_ENV]: '1' },
    }
  );
  const elapsedMs = performance.now() - startedAt;

  const outcome = resolveRespawnOutcome(result, elapsedMs);
  if (outcome.kind === 'fallback') {
    process.stderr.write(`${RESPAWN_FALLBACK_NOTICE}\n`);
    return;
  }
  if (outcome.kind === 'crash') {
    process.stderr.write(`${RESPAWN_CRASH_NOTICE}\n`);
  }

  process.exit(outcome.code);
}
