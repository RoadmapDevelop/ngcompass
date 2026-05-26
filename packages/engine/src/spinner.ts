import process from 'node:process';
import { SPINNER_FRAME_INTERVAL_MS } from './constants.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const HIDE_CURSOR = '\x1B[?25l';

const SHOW_CURSOR = '\x1B[?25h';

const CLEAR_LINE = '\r\x1B[K';

export class Spinner {
  private frameIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private message = '';

  start(message: string): void {
    this.message = message;
    if (this.interval) return;

    this.frameIndex = 0;
    process.stderr.write(HIDE_CURSOR);
    this.interval = setInterval(() => {
      process.stderr.write(`\r${FRAMES[this.frameIndex]} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length;
    }, SPINNER_FRAME_INTERVAL_MS);
  }

  update(message: string): void {
    this.message = message;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stderr.write(CLEAR_LINE);
    if (finalMessage) process.stderr.write(finalMessage + '\n');
    process.stderr.write(SHOW_CURSOR);
  }
}
