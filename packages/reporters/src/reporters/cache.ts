import pc from 'picocolors';
import type { CacheInfo } from '@ngcompass/cache';
import type { CacheReporter } from '../models/index.js';
import { processOutput } from '../output.js';
import type { ReporterOutput } from '../models/index.js';

const CACHE_META: Record<
  'ast' | 'config' | 'results',
  { label: string; desc: string }
> = {
  ast: { label: 'ast', desc: 'parsed TypeScript & HTML template ASTs' },
  config: { label: 'config', desc: 'resolved configuration snapshots' },
  results: { label: 'results', desc: 'previous analysis results' },
};

const INFO_COLUMNS = { type: 18, entries: 14, size: 12 } as const;

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export class TextCacheReporter implements CacheReporter {
  constructor(private readonly out: ReporterOutput = processOutput) {}

  renderClearResult(type: 'ast' | 'config' | 'results' | 'all'): void {
    const cleared =
      type === 'all'
        ? (['ast', 'config', 'results'] as const)
        : ([type] as const);

    const headerLabel =
      type === 'all' ? 'All caches cleared' : `${type} cache cleared`;

    this.out.write('');
    this.out.write(`  ${pc.green('◆')}  ${pc.bold(pc.green(headerLabel))}`);
    this.out.write('');

    const maxLen = Math.max(...cleared.map((t) => CACHE_META[t].label.length));
    for (const t of cleared) {
      const { label, desc } = CACHE_META[t];
      this.out.write(
        `     ${pc.dim('○')}  ${pc.cyan(label.padEnd(maxLen))}  ${pc.dim('—')}  ${pc.dim(desc)}`
      );
    }
    this.out.write('');

    if (type === 'all') {
      this.out.write(
        `  ${pc.dim('›')}  ${pc.dim('The next analysis will cold-start and rebuild all cache data.')}`
      );
    } else {
      const remaining = (['ast', 'config', 'results'] as const)
        .filter((t) => t !== type)
        .map((t) => pc.cyan(t))
        .join(pc.dim(', '));
      this.out.write(
        `  ${pc.dim('›')}  ${pc.dim(`${remaining} ${remaining.includes(',') ? 'caches are' : 'cache is'} untouched.`)}`
      );
      this.out.write(`  ${pc.dim('›')}  ${pc.dim(rebuildHint(type))}`);
    }

    this.out.write(
      `  ${pc.dim('›')}  ${pc.dim('Tip: use')} ${pc.dim(pc.bold('--force'))} ${pc.dim('on a single run to bypass cache without wiping it.')}`
    );
    this.out.write('');
  }

  renderCacheInfo(info: CacheInfo): void {
    this.out.write('');
    this.out.write(
      `  ${pc.bold('Cache')}  ${pc.dim('·')}  ${pc.cyan(`v${info.version}`)}  ${pc.dim('·')}  ${pc.dim(info.location)}`
    );
    this.out.write('');

    const divider = pc.dim(
      '  ' +
        '─'.repeat(
          INFO_COLUMNS.type + INFO_COLUMNS.entries + INFO_COLUMNS.size - 2
        )
    );

    this.out.write(
      '  ' +
        pc.dim('Type'.padEnd(INFO_COLUMNS.type)) +
        pc.dim('Entries'.padEnd(INFO_COLUMNS.entries)) +
        pc.dim('Size')
    );
    this.out.write(divider);

    this.printInfoRow(
      'AST  (L1 in-memory)',
      `${info.ast.l1.entries} / ${info.ast.l1.maxEntries}`,
      info.ast.l1.size
    );
    this.printInfoRow(
      'AST  (L2 on-disk)',
      String(info.ast.l2.entries),
      info.ast.l2.size
    );
    this.printInfoRow('Config', String(info.config.entries), info.config.size);
    this.printInfoRow(
      'Results',
      String(info.results.entries),
      info.results.size
    );

    this.out.write(divider);

    const totalEntries =
      info.ast.l1.entries +
      info.ast.l2.entries +
      info.config.entries +
      info.results.entries;
    this.out.write(
      '  ' +
        pc.bold('Total'.padEnd(INFO_COLUMNS.type)) +
        pc.bold(String(totalEntries).padEnd(INFO_COLUMNS.entries)) +
        pc.bold(formatSize(info.totalSize))
    );

    this.out.write('');
    this.out.write(
      `  ${pc.dim('›')}  ${pc.dim('Run')} ${pc.dim(pc.bold('ngcompass cache clear'))} ${pc.dim('to wipe all cached data.')}`
    );
    this.out.write('');
  }

  private printInfoRow(type: string, entries: string, sizeBytes: number): void {
    const isEmpty = sizeBytes === 0 && entries === '0';
    const colorFn = isEmpty ? pc.dim : (s: string) => s;
    this.out.write(
      '  ' +
        colorFn(pc.cyan(type.padEnd(INFO_COLUMNS.type))) +
        colorFn(entries.padEnd(INFO_COLUMNS.entries)) +
        colorFn(formatSize(sizeBytes))
    );
  }
}

function rebuildHint(type: 'ast' | 'config' | 'results'): string {
  switch (type) {
    case 'ast':
      return 'The next analysis will re-parse all source files.';
    case 'config':
      return 'The next analysis will re-resolve your configuration.';
    case 'results':
      return 'The next analysis will re-run all checks from scratch.';
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return pc.dim('—');
  const k = 1024;
  const i = Math.min(
    SIZE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k))
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${SIZE_UNITS[i]}`;
}
