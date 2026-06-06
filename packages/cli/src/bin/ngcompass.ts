import { Command } from 'commander';
import { registerCommands } from '../commands/index.js';
import { enableDebug, PACKAGE_VERSION } from '@ngcompass/common';
import { createCacheContext, CacheContext } from '@ngcompass/cache';
import { registerAllBuiltinRules } from '@ngcompass/rules';
import { restoreCursor, printError } from '../commands/exit.js';
import { maybeRespawnWithExposeGc } from './gc-respawn.js';

const FLUSH_TIMEOUT_MS = 10_000;

const SIGINT_EXIT_CODE = 130;
const SIGTERM_EXIT_CODE = 143;

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
    } catch (error: unknown) {
      printError('[ngcompass] Cache flush failed during shutdown', error);
    }
  }

  process.exit(exitCode);
};

const handleFatalAsyncFailure = (
  cache: CacheContext,
  label: string,
  reason: unknown
): void => {
  printError(`[ngcompass] ${label}`, reason);
  void gracefulShutdown(cache, 1);
};

const printRunBanner = async (commandName: string): Promise<void> => {
  const { default: pc } = await import('picocolors');
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
};

const isBannerSuppressedFormat = (format: unknown): boolean => {
  return (
    format === 'json' ||
    format === 'sarif' ||
    format === 'html' ||
    format === 'ui'
  );
};

export async function run(): Promise<void> {
  maybeRespawnWithExposeGc();

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
      if (!actionOpts.stdout && !isBannerSuppressedFormat(actionOpts.format)) {
        const parent = actionCommand.parent;
        const commandName =
          parent && parent.name() !== 'ngcompass'
            ? parent.name()
            : actionCommand.name();
        await printRunBanner(commandName);
      }
    });

  const cache = createCacheContext();

  process.on('SIGINT', () => void gracefulShutdown(cache, SIGINT_EXIT_CODE));
  process.on('SIGTERM', () => void gracefulShutdown(cache, SIGTERM_EXIT_CODE));

  process.on('uncaughtException', (err: Error) => {
    handleFatalAsyncFailure(cache, 'Unexpected error', err);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    handleFatalAsyncFailure(cache, 'Unhandled promise rejection', reason);
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
    printError('[ngcompass] Fatal error', err);
    await gracefulShutdown(cache, 1);
  }
}

run().catch((err: unknown) => {
  printError('[ngcompass] Fatal error', err);
  restoreCursor();
  process.exit(1);
});
