#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from '../commands/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableDebug } from '@ngcompass/common';
import { createCacheContext, CacheContext } from '@ngcompass/cache';
import { registerAllBuiltinRules } from '@ngcompass/rules';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Robust package.json discovery (works whether bundled in dist/ or running from src/bin/)
let packageJsonPath = '';
let currentDir = __dirname;
while (currentDir !== path.parse(currentDir).root) {
    const checkPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(checkPath)) {
        packageJsonPath = checkPath;
        break;
    }
    currentDir = path.dirname(currentDir);
}

if (!packageJsonPath) {
    throw new Error('Could not find package.json');
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// ---------------------------------------------------------------------------
// Shared terminal helpers
// ---------------------------------------------------------------------------

/** Restore the terminal cursor unconditionally (idempotent). */
const restoreCursor = () => process.stdout.write('\x1B[?25h');

// ---------------------------------------------------------------------------
// Graceful shutdown (signal-triggered)
// ---------------------------------------------------------------------------

/**
 * Performs cleanup before process exit: restores the terminal cursor and
 * flushes any pending cache writes.  Re-entrant calls are ignored.
 *
 * TICKET-007 hardening: the flush is raced against a 10 s timeout so a
 * stalled LevelDB write (full disk, locked file, etc.) can never prevent
 * the process from exiting on SIGINT/SIGTERM.
 */
const FLUSH_TIMEOUT_MS = 10_000;

let shutdownInProgress = false;
const gracefulShutdown = async (cache: CacheContext | null, exitCode: number): Promise<void> => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    restoreCursor();

    if (cache) {
        try {
            const flushTimeout = new Promise<void>((resolve) =>
                setTimeout(resolve, FLUSH_TIMEOUT_MS).unref()
            );
            await Promise.race([cache.flush(), flushTimeout]);
        } catch {
            // Best-effort flush — do not block shutdown on failure.
        }
    }

    process.exit(exitCode);
};

// ---------------------------------------------------------------------------
// TICKET-006: Global last-resort crash handlers
//
// These fire when an exception propagates outside every try-catch, or when a
// Promise rejection is never handled.  Without them Node prints a raw stack
// trace and may leave the cursor hidden.
// ---------------------------------------------------------------------------

process.on('uncaughtException', (err: Error) => {
    restoreCursor();
    console.error(`\n[ngcompass] Unexpected error: ${err.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
    restoreCursor();
    const msg = reason instanceof Error ? reason.message : String(reason);
    console.error(`\n[ngcompass] Unhandled promise rejection: ${msg}`);
    process.exit(1);
});

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

export async function run() {
    const program = new Command();

    program
        .name('compass')
        .description(packageJson.description || 'Angular Analysis Toolkit')
        .version(packageJson.version)
        .option('--debug', 'Enable debug output (all namespaces)')
        .hook('preAction', (thisCommand) => {
            const opts = thisCommand.opts();
            if (opts.debug) {
                enableDebug('debug', 'all');
            }
        });

    // Initialize shared cache context
    const cache = createCacheContext();

    // Register signal handlers for graceful shutdown
    process.on('SIGINT', () => void gracefulShutdown(cache, 130));
    process.on('SIGTERM', () => void gracefulShutdown(cache, 143));

    // Register all built-in rules explicitly
    registerAllBuiltinRules();

    // Register all commands with shared cache
    registerCommands(program, cache);

    // Default to help if no command provided
    if (!process.argv.slice(2).length) {
        program.outputHelp();
        return;
    }

    // TICKET-007: Use parseAsync so the event loop stays alive until the
    // command's async action has fully resolved before we flush and exit.
    // program.parse() is synchronous and returns immediately, meaning
    // cache.flush() would race ahead of the running command action.
    await program.parseAsync(process.argv);

    // Flush pending cache writes before exit
    await cache.flush();

    // TICKET-007: Force process exit after flush.  Libraries such as LevelDB
    // (used by the cache package) keep their own handles open; without an
    // explicit exit the process hangs indefinitely after a successful run.
    process.exit(0);
}

// Execute if run via node
run().catch((err: unknown) => {
    restoreCursor();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ngcompass] Fatal error: ${msg}`);
    process.exit(1);
});
