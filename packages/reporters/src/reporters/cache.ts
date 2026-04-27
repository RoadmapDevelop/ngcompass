import pc from 'picocolors';
import type { CacheReporter } from '../types.js';
import type { CacheInfo } from '@ngcompass/cache';

function writeLine(line = ''): void {
    process.stdout.write(`${line}\n`);
}

export class TextCacheReporter implements CacheReporter {
    renderClearResult(type: 'ast' | 'config' | 'results' | 'all'): void {
        if (type === 'all') {
            writeLine(pc.green('Cleared all caches'));
        } else {
            writeLine(pc.green(`Cleared ${type} cache`));
        }
    }

    renderCacheInfo(info: CacheInfo): void {
        writeLine();
        writeLine(pc.bold('Cache Status:'));
        writeLine(`${pc.dim('Location:')} ${info.location}`);
        writeLine(`${pc.dim('Version:')} ${info.version}`);
        writeLine();

        writeLine(
            pc.gray('Type'.padEnd(15)) +
            pc.gray('Entries'.padEnd(15)) +
            pc.gray('Size'.padEnd(15)) +
            pc.gray('Hit Rate')
        );
        writeLine(pc.gray('─'.repeat(55)));

        this.printRow('Config', String(info.config.entries), this.formatSize(info.config.size));
        this.printRow('AST (L1)', String(info.ast.l1.entries), this.formatSize(info.ast.l1.size));
        this.printRow('AST (L2)', String(info.ast.l2.entries), this.formatSize(info.ast.l2.size));
        this.printRow('Results', String(info.results.entries), this.formatSize(info.results.size));

        writeLine();
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private printRow(type: string, entries: string, size: string, hitRate: string = '-'): void {
        writeLine(
            pc.blue(type.padEnd(15)) +
            entries.padEnd(15) +
            size.padEnd(15) +
            hitRate
        );
    }
}
