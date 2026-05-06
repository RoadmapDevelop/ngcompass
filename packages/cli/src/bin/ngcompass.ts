import { Command } from 'commander';
import { registerCommands } from '../commands/index.js';
import { enableDebug, PACKAGE_VERSION } from '@ngcompass/common';
import { createCacheContext, CacheContext } from '@ngcompass/cache';
import { registerAllBuiltinRules } from '@ngcompass/rules';

const restoreCursor = () => {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1B[?25h');
};

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
    .version(PACKAGE_VERSION, '-V, --version', 'Display ngcompass version')
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
        actionOpts.format !== 'sarif' &&
        actionOpts.format !== 'html' &&
        actionOpts.format !== 'ui'
      ) {
        const { default: pc } = await import('picocolors');
        const commandName = actionCommand.name();
        const cwd = process.cwd();
        process.stdout.write(
          [
            ``,
            `${pc.dim('>')} ${pc.dim(`ngcompass@${PACKAGE_VERSION}`)} ${pc.dim(commandName)} ${pc.dim(cwd)}`,
            `${pc.dim('>')} ${pc.dim('ngcompass')} ${pc.dim('run')}`,
            ``,
            ` ${pc.bgCyan(pc.white(pc.bold(` ${commandName.toUpperCase()} `)))}  ${pc.cyan(PACKAGE_VERSION)}  ${pc.dim(cwd)}`,
            ``,
            ``,
          ].join('\n')
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
