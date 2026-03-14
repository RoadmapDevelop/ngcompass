/**
 * @fileoverview
 * Provides a terminal-based progress visualization utility.
 *
 * Implements a high-efficiency visual indicator (spinner) for long-running
 * command-line operations, isolated from core analytical logic.
 */

import { SPINNER_FRAME_INTERVAL_MS } from './constants.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Manages the state and rendering of a terminal-based progress indicator.
 */
export class Spinner {
    private frameIndex = 0;
    private interval: NodeJS.Timeout | null = null;
    private message = '';

    start(message: string): void {
        this.message = message;
        this.frameIndex = 0;
        // Hide cursor while spinning
        process.stdout.write('\x1B[?25l');
        this.interval = setInterval(() => {
            process.stdout.write(`\r${FRAMES[this.frameIndex]} ${this.message}`);
            this.frameIndex = (this.frameIndex + 1) % FRAMES.length;
        }, SPINNER_FRAME_INTERVAL_MS);
    }

    stop(finalMessage?: string): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        // Clear the spinner line and restore cursor
        process.stdout.write('\r\x1B[K');
        if (finalMessage) process.stdout.write(finalMessage + '\n');
        process.stdout.write('\x1B[?25h');
    }
}

