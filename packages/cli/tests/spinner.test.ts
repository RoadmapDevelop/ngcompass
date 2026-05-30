import { describe, it, expect, afterEach } from 'vitest';
import { enableDebug, disableDebug, debug } from '@ngcompass/common';
import { Spinner } from '../src/spinner.js';

function createCapture(isTTY: boolean): {
  stream: NodeJS.WriteStream;
  written: string[];
} {
  const written: string[] = [];
  const stream = {
    isTTY,
    write: (chunk: string): boolean => {
      written.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, written };
}

const FRAME_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

describe('Spinner', () => {
  afterEach(() => {
    disableDebug();
  });

  it('writes a single plain line when the stream is not a TTY', () => {
    const { stream, written } = createCapture(false);
    const spinner = new Spinner(stream);

    spinner.start('Analyzing');
    spinner.stop();

    expect(written).toEqual([expect.stringContaining('Analyzing')]);
  });

  it('clears and redraws around debug log lines so output is not garbled', () => {
    const { stream, written } = createCapture(true);
    enableDebug('debug', 'all');
    const spinner = new Spinner(stream);

    spinner.start('working');
    written.length = 0;
    debug('engine', 'a log line');
    spinner.stop();

    const joined = written.join('');
    expect(joined).toContain('\r\x1B[K');
    expect(joined).toMatch(FRAME_RE);
  });

  it('does not redraw the spinner once stopped', () => {
    const { stream, written } = createCapture(true);
    enableDebug('debug', 'all');
    const spinner = new Spinner(stream);

    spinner.start('working');
    spinner.stop();
    written.length = 0;
    debug('engine', 'a log line after stop');

    expect(written).toEqual([]);
  });
});
