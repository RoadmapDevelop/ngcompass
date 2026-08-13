import path from 'node:path';
import process from 'node:process';
import { createAtomicDriver } from './drivers/atomic.js';
import { createDiskDriver } from './drivers/disk.js';
import { createJsonFileDriver } from './drivers/json-file.js';
import { createMemoryDriver } from './drivers/memory.js';
import { createPackedFileDriver } from './drivers/packed.js';
import { CACHE_KEY_PREFIX, CACHE_VERSION } from './constants.js';
import { computeCompositeHash } from './services/hashing.js';
import { createAstCache } from './services/ast-cache.js';
import { createConfigCache } from './services/config-cache.js';
import { createFileCache } from './services/file-cache.js';
import { createMetaCache } from './services/meta-cache.js';
import { createPlanCache } from './services/plan-cache.js';
import { createResultCache } from './services/result-cache.js';
import { createSourceCache } from './services/source-cache.js';
import type {
  AstEntry,
  AsyncDriver,
  CacheConfig,
  CacheContext,
  DriverStats,
  FileCacheEntry,
  FileMeta,
  SourceEntry,
} from './models/index.js';
import type { ConfigValidationResult } from '@ngcompass/common';

const AST_L1_MAX_ENTRIES = 200;

const SUBDIR = {
  ast: 'ast',
  results: 'results',
  config: 'config',
  meta: 'meta',
  plans: 'plans',
  files: 'files',
  analysis: 'analysis',
} as const;

const MEMORY_LOCATION = '[memory]';

const createAsyncMemoryDriver = <T>(
  maxItems?: number,
  ttl?: number
): AsyncDriver<T> => {
  const driver = createMemoryDriver<T>({ maxItems, ttl });
  return {
    get: async (key) => driver.get(key),
    set: async (key, value) => {
      driver.set(key, value);
    },
    has: async (key) => driver.has(key),
    delete: async (key) => {
      driver.delete(key);
    },
    clear: async () => {
      driver.clear();
    },
    getStats: async (): Promise<DriverStats> => driver.getStats(),
  };
};

type PrunableDriver = AsyncDriver<AstEntry> & { prune: () => Promise<void> };

const isPrunableDriver = (
  driver: AsyncDriver<AstEntry>
): driver is PrunableDriver =>
  'prune' in driver && typeof driver.prune === 'function';

const resolveDiskRoot = (config: CacheConfig): string => {
  if (config.disk?.path) return config.disk.path;
  return path.resolve(process.cwd(), 'node_modules', '.cache', 'ngcompass');
};

export const createCacheContext = (config: CacheConfig = {}): CacheContext => {
  const useMemoryOnly = !config.disk?.path;
  const diskRoot = useMemoryOnly ? MEMORY_LOCATION : resolveDiskRoot(config);
  const cacheLocation = useMemoryOnly ? MEMORY_LOCATION : diskRoot;
  const diskTtl = config.disk?.ttl;
  const memTtl = config.memory?.ttl;
  const memMax = config.memory?.maxItems;

  const sourceDriver = createMemoryDriver<SourceEntry>({ maxItems: memMax });
  const astL1 = createMemoryDriver<AstEntry>({ maxItems: AST_L1_MAX_ENTRIES });

  const astL2 = useMemoryOnly
    ? createAsyncMemoryDriver<AstEntry>(memMax, memTtl)
    : createDiskDriver<AstEntry>({
        path: path.join(diskRoot, SUBDIR.ast),
        ttl: diskTtl,
      });

  const resultDriver = useMemoryOnly
    ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
    : createPackedFileDriver<unknown>({
        path: path.join(diskRoot, SUBDIR.results),
      });

  const configDriver = useMemoryOnly
    ? createAsyncMemoryDriver<ConfigValidationResult>(memMax, memTtl)
    : createAtomicDriver<ConfigValidationResult>({
        path: path.join(diskRoot, SUBDIR.config),
      });

  const metaDriver = useMemoryOnly
    ? createAsyncMemoryDriver<FileMeta>(memMax, memTtl)
    : createJsonFileDriver<FileMeta>({
        path: path.join(diskRoot, SUBDIR.meta),
      });

  const planDriver = useMemoryOnly
    ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
    : createDiskDriver<unknown>({
        path: path.join(diskRoot, SUBDIR.plans),
        ttl: diskTtl,
      });

  const fileDriver = useMemoryOnly
    ? createAsyncMemoryDriver<FileCacheEntry>(memMax, memTtl)
    : createDiskDriver<FileCacheEntry>({
        path: path.join(diskRoot, SUBDIR.files),
        ttl: diskTtl,
      });

  const analysisDriver = useMemoryOnly
    ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
    : createDiskDriver<unknown>({
        path: path.join(diskRoot, SUBDIR.analysis),
        ttl: diskTtl,
      });

  const sources = createSourceCache(sourceDriver);
  const asts = createAstCache(astL1, astL2);
  const results = createResultCache(resultDriver);
  const configs = createConfigCache(configDriver);
  const metas = createMetaCache(metaDriver);
  const plans = createPlanCache(planDriver);
  const files = createFileCache(fileDriver);
  const analysis = createResultCache(analysisDriver);

  const clearAllDrivers = async (): Promise<void> => {
    sourceDriver.clear();
    astL1.clear();
    await Promise.all([
      astL2.clear(),
      resultDriver.clear(),
      configDriver.clear(),
      metaDriver.clear(),
      planDriver.clear(),
      fileDriver.clear(),
      analysisDriver.clear(),
    ]);
  };

  const prune = async (): Promise<void> => {
    if (isPrunableDriver(astL2)) {
      await astL2.prune();
    }
  };

  return {
    sources,
    asts,
    results,
    configs,
    metas,
    plans,
    files,
    analysis,
    computeHash: (content, salt) =>
      computeCompositeHash(content, salt ?? CACHE_KEY_PREFIX),
    prune,
    clear: clearAllDrivers,
    clearType: async (type) => {
      switch (type) {
        case 'ast':
          astL1.clear();
          await astL2.clear();
          break;
        case 'config':
          await configDriver.clear();
          break;
        case 'results':
          await Promise.all([resultDriver.clear(), analysisDriver.clear()]);
          break;
        case 'all':
          await clearAllDrivers();
          break;
      }
    },
    flush: async () => {
      await Promise.all([results.flush(), analysis.flush(), metas.flush()]);
    },
    getCachePath: () => cacheLocation,
    getInfo: async () => {
      const astL1Stats = astL1.getStats();
      const [
        astL2Stats,
        configStats,
        resultStats,
        metaStats,
        planStats,
        fileStats,
        analysisStats,
      ] = await Promise.all([
        astL2.getStats(),
        configDriver.getStats(),
        resultDriver.getStats(),
        metaDriver.getStats(),
        planDriver.getStats(),
        fileDriver.getStats(),
        analysisDriver.getStats(),
      ]);

      const totalSize =
        astL1Stats.size +
        astL2Stats.size +
        configStats.size +
        resultStats.size +
        metaStats.size +
        planStats.size +
        fileStats.size +
        analysisStats.size;

      return {
        ast: {
          l1: {
            entries: astL1Stats.entries,
            maxEntries: AST_L1_MAX_ENTRIES,
            size: astL1Stats.size,
          },
          l2: { entries: astL2Stats.entries, size: astL2Stats.size },
        },
        config: { entries: configStats.entries, size: configStats.size },
        results: { entries: resultStats.entries, size: resultStats.size },
        totalSize,
        location: cacheLocation,
        version: CACHE_VERSION,
      };
    },
  };
};

let globalCache: CacheContext | null = null;

export const getCacheContext = (config?: CacheConfig): CacheContext => {
  if (!globalCache) {
    globalCache = createCacheContext(config);
  }
  return globalCache;
};

export const resetGlobalCache = (): void => {
  globalCache = null;
};
