/**
 * @fileoverview
 * Terminal progress spinner.
 *
 * Writes braille-style frames to **stderr** (never stdout) so the
 * machine-readable output stream — JSON / SARIF / HTML reports — is never
 * polluted. Use `process.stdout` only for analyzer payloads; status output
 * lives on stderr per the project conventions.
 */

import process from 'node:process';
import { SPINNER_FRAME_INTERVAL_MS } from './constants.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Hides the cursor while the spinner is active. */
const HIDE_CURSOR = '\x1B[?25l';
/** Restores the cursor after the spinner stops. */
const SHOW_CURSOR = '\x1B[?25h';
/** Clears from cursor to end-of-line. */
const CLEAR_LINE = '\r\x1B[K';

/** A simple animated status indicator for long-running CLI operations. */
export class Spinner {
    private frameIndex = 0;
    private interval: NodeJS.Timeout | null = null;
    private message = '';

    /**
     * Starts (or refreshes) the spinner. Calling `start()` while the spinner
     * is already running just updates the displayed message — the previous
     * interval is reused so we never leak timers.
     */
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

    /** Updates the displayed message without restarting the animation. */
    update(message: string): void {
        this.message = message;
    }

    /** Stops the spinner and optionally prints a closing line. */
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
