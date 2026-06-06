export * from './rule-handler.js';

export * from './visitor-registry.js';

export * from './single-pass-engine.js';

export * from './rule-context-factory.js';

export * from './orchestrator.js';

export {
  buildFileProgress,
  isAnalysisFileProgress,
  isWorkerFileProgress,
} from './progress.js';

export { createAnalysisContext } from './analysis-context.js';
export type { AnalysisContext } from './analysis-context.js';

export {
  buildProjectContext,
  buildImportGraphOnly,
  type ImportGraphResult,
} from './project-context-builder.js';

export {
  createTypeAwareAnalysisContext,
} from './type-aware-context.js';
export type {
  TypeAwareAnalysisContext,
  TypeAwareAnalysisContextOptions,
} from './type-aware-context.js';


export { createAngularTypeIndex } from './angular-type-index.js';

export { executeBatchedTasks } from './runner.js';

export { configureRuleExecutor } from './rule-executor.js';
export type { BatchRuleExecutorFn, RuleCheckerFn } from './rule-executor.js';

export * from './analysis-stats.js';

export * from './constants.js';

export {
  requestGarbageCollection,
  requestGarbageCollectionUnderPressure,
  getHeapPressureRatio,
} from './runtime-memory.js';

export * from './spinner.js';

export * from './worker-pool.js';

export * from './cycle-detector.js';

export * from './graph-scope.js';

export {
  buildImportGraphOxc,
  type OxcGraphOptions,
} from './import-graph-oxc.js';
