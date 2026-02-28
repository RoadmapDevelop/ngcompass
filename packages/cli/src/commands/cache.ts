import { CacheContext } from '@ngcompass/cache';
import { Command } from 'commander';
import pc from 'picocolors';

export function registerCacheCommand(program: Command, cache: CacheContext) {
    const cacheCmd = program
        .command('cache')
        .description('Manage cache');

    // ngcompass cache clear
    cacheCmd
        .command('clear')
        .description('Clear all or specific caches')
        .option('--type <type>', 'Cache type: ast|config|results|all', 'all')
        .action(async (options: { type: string }) => {
            console.log('Clearing cache...');

            const type = options.type as 'ast' | 'config' | 'results' | 'all';

            // Validate type
            const validTypes = ['ast', 'config', 'results', 'all'];
            if (!validTypes.includes(type)) {
                console.error(pc.red(`Invalid cache type: ${type}. Must be one of: ${validTypes.join(', ')}`));
                process.exit(1);
            }

            try {
                if (type === 'all') {
                    await cache.clear();
                    console.log(pc.green('✓ Cleared all caches'));
                } else {
                    await cache.clearType(type);
                    console.log(pc.green(`✓ Cleared ${type} cache`));
                }
            } catch (err) {
                console.error(pc.red('Error clearing cache:'), err);
                process.exit(1);
            }
        });

    // ngcompass cache info
    cacheCmd
        .command('info')
        .description('Show cache status and statistics')
        .action(async () => {
            try {
                const info = await cache.getInfo();

                console.log('');
                console.log(pc.bold('Cache Status:'));
                console.log(pc.dim('Location:'), info.location);
                console.log(pc.dim('Version: '), info.version);
                console.log('');

                const formatSize = (bytes: number) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                };

                // Table-like output
                const printRow = (type: string, entries: string, size: string, hitRate: string = '-') => {
                    console.log(
                        pc.blue(type.padEnd(15)) +
                        entries.padEnd(15) +
                        size.padEnd(15) +
                        hitRate
                    );
                };

                const printHeader = () => {
                    console.log(
                        pc.gray('Type'.padEnd(15)) +
                        pc.gray('Entries'.padEnd(15)) +
                        pc.gray('Size'.padEnd(15)) +
                        pc.gray('Hit Rate')
                    );
                    console.log(pc.gray('─'.repeat(55)));
                };

                printHeader();

                // Config
                printRow('Config',
                    String(info.config.entries),
                    formatSize(info.config.size)
                );

                // AST
                printRow('AST (L1)',
                    String(info.ast.l1.entries),
                    formatSize(info.ast.l1.size)
                );
                printRow('AST (L2)',
                    String(info.ast.l2.entries),
                    formatSize(info.ast.l2.size)
                );

                // Results
                printRow('Results',
                    String(info.results.entries),
                    formatSize(info.results.size)
                );

                console.log('');
            } catch (err) {
                console.error(pc.red('Error getting cache info:'), err);
                process.exit(1);
            }
        });

    // ngcompass cache path
    cacheCmd
        .command('path')
        .description('Show cache directory location')
        .action(() => {
            console.log(cache.getCachePath());
        });
}
