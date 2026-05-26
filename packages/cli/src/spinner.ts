import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private message = '';
  private readonly isTTY: boolean;

  constructor(private readonly stream: NodeJS.WriteStream) {
    this.isTTY = !!stream.isTTY;
  }

  start(message: string): void {
    this.message = message;
    this.frameIndex = 0;

    if (!this.isTTY) {
      this.stream.write(`${pc.cyan('❯')} ${pc.dim(message)}\n`);
      return;
    }

    this.stream.write('\x1B[?25l');
    this.render();
    this.timer = setInterval(() => this.render(), INTERVAL_MS);
  }

  update(message: string): void {
    this.message = message;

    if (this.isTTY && this.timer) {
      this.render();
    }
  }

  writeLine(line: string): void {
    if (this.isTTY && this.timer) {
      this.stream.write('\r\x1B[K');
      this.stream.write(`${line}\n`);
      this.render();
    } else {
      this.stream.write(`${line}\n`);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.isTTY) {
      this.stream.write('\r\x1B[K');
      this.stream.write('\x1B[?25h');
    }
  }

  private render(): void {
    const frame = pc.cyan(FRAMES[this.frameIndex % FRAMES.length]);
    this.frameIndex++;
    this.stream.write(`\r\x1B[K${frame} ${pc.dim(this.message)}`);
  }
}
