import { describe, it, expect } from 'vitest';
import { resolveChildExecArgv } from '../src/execution/orchestrator.js';

const countExposeGc = (argv: ReadonlyArray<string>): number =>
  argv.filter((arg) => arg === '--expose-gc').length;

describe('resolveChildExecArgv', () => {
  it('adds the default heap limit when nothing configures one', () => {
    const argv = resolveChildExecArgv([], undefined);
    expect(argv).toEqual(['--expose-gc', '--max-old-space-size=4096']);
  });

  it('does not override a heap limit set through NODE_OPTIONS', () => {
    const argv = resolveChildExecArgv([], '--max-old-space-size=8192');
    expect(argv).toEqual(['--expose-gc']);
  });

  it('recognizes the underscore spelling in NODE_OPTIONS', () => {
    const argv = resolveChildExecArgv([], '--max_old_space_size=8192');
    expect(argv).toEqual(['--expose-gc']);
  });

  it('forwards an explicit equals-form flag from execArgv', () => {
    const argv = resolveChildExecArgv(['--max-old-space-size=8192'], undefined);
    expect(argv).toEqual(['--expose-gc', '--max-old-space-size=8192']);
  });

  it('forwards a split-form flag and its value from execArgv', () => {
    const argv = resolveChildExecArgv(
      ['--max-old-space-size', '8192'],
      undefined
    );
    expect(argv).toEqual(['--expose-gc', '--max-old-space-size', '8192']);
  });

  it('does not duplicate --expose-gc already present in execArgv', () => {
    const argv = resolveChildExecArgv(['--expose-gc'], undefined);
    expect(countExposeGc(argv)).toBe(1);
    expect(argv).toContain('--max-old-space-size=4096');
  });
});
