import { Command } from 'commander';
import { registerCommands } from '../commands/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableDebug } from '@ngcompass/common';
import { createCacheContext, CacheContext } from '@ngcompass/cache';
import { registerAllBuiltinRules } from '@ngcompass/rules';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  throw new Error(
    '[ngcompass] Could not find package.json above this CLI install. Reinstall the package or run from a project that contains package.json.'
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const restoreCursor = () => process.stdout.write('\x1B[?25h');

const FLUSH_TIMEOUT_MS = 10_000;

let shutdownInProgress = false;
const gracefulShutdown = async (
  cache: CacheContext | null,
  exitCode: number
): Promise<void> => {
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

export async function run() {
  const program = new Command();

  program
    .name('ngcompass')
    .description(
      'Static analysis and architecture insights for Angular codebases.'
    )
    .version(`v${packageJson.version}`, '-V, --version', 'Display ngcompass version')
    .option('--debug', 'Enable detailed debug logs across all modules')
    .addHelpText(
      'after',
      '\nExamples:\n  $ ngcompass init\n  $ ngcompass analyze --profile strict\n  $ ngcompass cache info\n'
    )
    .hook('preAction', async (thisCommand, actionCommand) => {
      const opts = thisCommand.opts();
      if (opts.debug) {
        enableDebug('debug', 'all');
      }

      const actionOpts = actionCommand.opts();
      if (
        actionOpts.format !== 'json' &&
        actionOpts.format !== 'html' &&
        actionOpts.format !== 'ui'
      ) {
        const { default: pc } = await import('picocolors');
        process.stdout.write(
          `${pc.bold('ngcompass')} ${pc.cyan(packageJson.version)}\n`
        );
      }
    });

  const cache = createCacheContext();

  process.on('SIGINT', () => void gracefulShutdown(cache, 130));
  process.on('SIGTERM', () => void gracefulShutdown(cache, 143));

  process.on('uncaughtException', (err: Error) => {
    restoreCursor();
    console.error(`\n[ngcompass] Unexpected error: ${err.message}`);
    void gracefulShutdown(cache, 1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    restoreCursor();
    const msg = reason instanceof Error ? reason.message : String(reason);
    console.error(`\n[ngcompass] Unhandled promise rejection: ${msg}`);
    void gracefulShutdown(cache, 1);
  });

  try {
    registerAllBuiltinRules();

    registerCommands(program, cache);

    if (!process.argv.slice(2).length) {
      program.outputHelp();
      return;
    }

    await program.parseAsync(process.argv);

    await cache.flush();

    process.exit(0);
  } catch (err: unknown) {
    restoreCursor();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ngcompass] Fatal error: ${msg}`);
    await gracefulShutdown(cache, 1);
  }
}

run().catch((err: unknown) => {
  restoreCursor();
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ngcompass] Fatal error: ${msg}`);
  process.exit(1);
});
