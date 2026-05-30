import { describe, it, expect } from 'vitest';
import { resolveRespawnOutcome } from '../../src/bin/gc-respawn.js';

const WITHIN_STARTUP_WINDOW_MS = 200;
const PAST_STARTUP_WINDOW_MS = 60_000;

describe('resolveRespawnOutcome', () => {
  it('propagates a clean exit code when the respawned child finishes', () => {
    expect(
      resolveRespawnOutcome(
        { error: undefined, signal: null, status: 0 },
        PAST_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'exit', code: 0 });
  });

  it('propagates an analysis-violation exit code without falling back', () => {
    expect(
      resolveRespawnOutcome(
        { error: undefined, signal: null, status: 1 },
        PAST_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'exit', code: 1 });
  });

  it('falls back when the child crashes at startup under memory pressure', () => {
    expect(
      resolveRespawnOutcome(
        { error: undefined, signal: 'SIGABRT', status: null },
        WITHIN_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'fallback' });
  });

  it('propagates a crash code when the child dies after startup mid-analysis', () => {
    expect(
      resolveRespawnOutcome(
        { error: undefined, signal: 'SIGABRT', status: null },
        PAST_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'crash', code: 1 });
  });

  it('falls back when the respawn fails to launch regardless of timing', () => {
    expect(
      resolveRespawnOutcome(
        { error: new Error('spawn ENOMEM'), signal: null, status: null },
        PAST_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'fallback' });
  });

  it('falls back when the child exits abnormally at startup without a status code', () => {
    expect(
      resolveRespawnOutcome(
        { error: undefined, signal: null, status: null },
        WITHIN_STARTUP_WINDOW_MS
      )
    ).toEqual({ kind: 'fallback' });
  });
});
