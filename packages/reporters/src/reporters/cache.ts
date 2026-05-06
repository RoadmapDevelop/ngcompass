import pc from 'picocolors';
import type { CacheReporter } from '../types.js';
import type { CacheInfo } from '@ngcompass/cache';

const w = (line = '') => process.stdout.write(`${line}\n`);

const CACHE_META: Record<'ast' | 'config' | 'results', { label: string; desc: string }> = {
    ast:     { label: 'ast',     desc: 'parsed TypeScript & HTML template ASTs' },
    config:  { label: 'config',  desc: 'resolved configuration snapshots' },
    results: { label: 'results', desc: 'previous analysis results' },
};

export class TextCacheReporter implements CacheReporter {
    renderClearResult(type: 'ast' | 'config' | 'results' | 'all'): void {
        const cleared = type === 'all'
            ? (['ast', 'config', 'results'] as const)
            : ([type] as const);

        const label = type === 'all' ? 'All caches cleared' : `${type} cache cleared`;

        w();
        w(`  ${pc.green('◆')}  ${pc.bold(pc.green(label))}`);
        w();

        const maxLen = Math.max(...cleared.map(t => CACHE_META[t].label.length));
        for (const t of cleared) {
            const { label: tLabel, desc } = CACHE_META[t];
            w(`     ${pc.dim('○')}  ${pc.cyan(tLabel.padEnd(maxLen))}  ${pc.dim('—')}  ${pc.dim(desc)}`);
        }

        w();

        if (type === 'all') {
            w(`  ${pc.dim('›')}  ${pc.dim('The next analysis will cold-start and rebuild all cache data.')}`);
        } else {
            const remaining = (['ast', 'config', 'results'] as const)
                .filter(t => t !== type)
                .map(t => pc.cyan(t))
                .join(pc.dim(', '));
            w(`  ${pc.dim('›')}  ${pc.dim(`${remaining} ${remaining.includes(',') ? 'caches are' : 'cache is'} untouched.`)}`);
            w(`  ${pc.dim('›')}  ${pc.dim(type === 'ast'
                ? 'The next analysis will re-parse all source files.'
                : type === 'config'
                ? 'The next analysis will re-resolve your configuration.'
                : 'The next analysis will re-run all checks from scratch.')}`);
        }

        w(`  ${pc.dim('›')}  ${pc.dim('Tip: use')} ${pc.dim(pc.bold('--force'))} ${pc.dim('on a single run to bypass cache without wiping it.')}`);
        w();
    }

    renderCacheInfo(info: CacheInfo): void {
        w();
        w(`  ${pc.bold('Cache')}  ${pc.dim('·')}  ${pc.cyan(`v${info.version}`)}  ${pc.dim('·')}  ${pc.dim(info.location)}`);
        w();

        const COL = { type: 18, entries: 14, size: 12 };
        const divider = pc.dim(
            '  ' + '─'.repeat(COL.type + COL.entries + COL.size - 2)
        );

        w(
            '  ' +
            pc.dim('Type'.padEnd(COL.type)) +
            pc.dim('Entries'.padEnd(COL.entries)) +
            pc.dim('Size')
        );
        w(divider);

        this.printInfoRow('AST  (L1 in-memory)', `${info.ast.l1.entries} / ${info.ast.l1.maxEntries}`, info.ast.l1.size, COL);
        this.printInfoRow('AST  (L2 on-disk)',   String(info.ast.l2.entries),                           info.ast.l2.size, COL);
        this.printInfoRow('Config',               String(info.config.entries),                           info.config.size, COL);
        this.printInfoRow('Results',              String(info.results.entries),                          info.results.size, COL);

        w(divider);

        const totalEntries =
            info.ast.l1.entries + info.ast.l2.entries + info.config.entries + info.results.entries;
        w(
            '  ' +
            pc.bold('Total'.padEnd(COL.type)) +
            pc.bold(String(totalEntries).padEnd(COL.entries)) +
            pc.bold(this.formatSize(info.totalSize))
        );

        w();
        w(`  ${pc.dim('›')}  ${pc.dim('Run')} ${pc.dim(pc.bold('ngcompass cache clear'))} ${pc.dim('to wipe all cached data.')}`);
        w();
    }

    private printInfoRow(
        type: string,
        entries: string,
        sizeBytes: number,
        col: { type: number; entries: number; size: number },
    ): void {
        const isEmpty = sizeBytes === 0 && entries === '0';
        const colorFn = isEmpty ? pc.dim : (s: string) => s;
        w(
            '  ' +
            colorFn(pc.cyan(type.padEnd(col.type))) +
            colorFn(entries.padEnd(col.entries)) +
            colorFn(this.formatSize(sizeBytes))
        );
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) return pc.dim('—');
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
}
