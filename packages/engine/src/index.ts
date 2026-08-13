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

export * from './execution/rule-handler.js';

export * from './execution/visitor-registry.js';

export * from './execution/single-pass-engine.js';

export * from './context/rule-context-factory.js';

export * from './execution/orchestrator.js';

export {
  buildFileProgress,
  isAnalysisFileProgress,
  isWorkerFileProgress,
} from './analysis/progress.js';

export { createAnalysisContext } from './analysis/analysis-context.js';

export {
  buildProjectContext,
  buildImportGraphOnly,
} from './context/project-context-builder.js';

export { createTypeAwareAnalysisContext } from './context/type-aware-context.js';


export { createAngularTypeIndex } from './context/angular-type-index.js';

export { executeBatchedTasks } from './execution/runner.js';

export { configureRuleExecutor } from './execution/rule-executor.js';

export * from './analysis/analysis-stats.js';

export * from './constants.js';

export {
  requestGarbageCollection,
  requestGarbageCollectionUnderPressure,
  getHeapPressureRatio,
} from './analysis/runtime-memory.js';

export * from './spinner.js';

export * from './execution/worker-pool.js';

export * from './project-graph/cycle-detector.js';

export * from './project-graph/graph-scope.js';

export { buildImportGraphOxc } from './project-graph/import-graph-oxc.js';

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
