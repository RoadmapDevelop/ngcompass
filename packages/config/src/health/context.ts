/**
 * @fileoverview
 * Default {@link ValidationContext} factory.
 *
 * Health checks receive their filesystem, OS, and path APIs through this
 * context so tests can substitute deterministic fakes. The factory wires
 * the real Node built-ins for production callers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { cpus } from 'node:os';
import process from 'node:process';
import type { ValidationContext } from './types.js';

/**
 * Builds a {@link ValidationContext} backed by the real Node APIs.
 *
 * @param overrides - Partial overrides used by tests to inject fakes.
 * @returns {ValidationContext} Fully populated validation context.
 */
export function createDefaultContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
    return {
        cwd: process.cwd(),
        fs: {
            existsSync: fs.existsSync,
            accessSync: (p: string, mode: number) => fs.accessSync(p, mode),
        },
        os: { cpus },
        path: {
            dirname: path.dirname,
            resolve: path.resolve,
            isAbsolute: path.isAbsolute,
        },
        ...overrides,
    };
}
