export type {
  AnalysisContext,
  AnalysisFileProgress,
  AnalysisOptions,
  BatchRuleExecutorFn,
  CallGraphEdge,
  CallGraphNode,
  ExecutionContext,
  ExternalCall,
  FileCallGraph,
  FileComplexity,
  FileUnitInput,
  FunctionComplexity,
  FunctionKind,
  ImportGraphResult,
  OxcGraphOptions,
  PerformanceReport,
  ProjectComplexityOptions,
  RuleCheckerFn,
  RuleHandler,
  SpecInput,
  StreamType,
  StyleInput,
  TemplateInput,
  TypeAwareAnalysisContext,
  TypeAwareAnalysisContextOptions,
  VisitorEntry,
  VisitorMap,
} from './models/index.js';

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

export {
  buildProjectContext,
  buildImportGraphOnly,
} from './project-context-builder.js';

export { createTypeAwareAnalysisContext } from './type-aware-context.js';


export { createAngularTypeIndex } from './angular-type-index.js';

export { executeBatchedTasks } from './runner.js';

export { configureRuleExecutor } from './rule-executor.js';

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

export { buildImportGraphOxc } from './import-graph-oxc.js';

export { computeFileComplexity } from './complexity/complexity-analyzer.js';

export { computeProjectComplexity } from './complexity/compute-project-complexity.js';

export { computeFileCallGraph } from './callgraph/call-graph-analyzer.js';

export { analyzeFileCallGraph } from './callgraph/compute-file-call-graph.js';

export { computeFileUnit } from './visualize/compute-file-unit.js';

export { analyzeFileUnitGraph } from './visualize/file-unit-analyzer.js';



export type {
  BoxKind,
  EdgeDirection,
  EdgeKind,
  FileUnitGraph,
  LaneKind,
  LaneStatus,
  UnitBox,
  UnitEdge,
  UnitLane,
  VisualizeError,
  VisualizeErrorKind,
} from './visualize/unit-graph.js';
