export type {
  BaselineError,
  BaselineOutcome,
  BaselineScope,
  PruneOutcome,
  ReconcileOutcome,
  RenameMatch,
  StaleEntry,
} from './models/index.js';
export {
  BASELINE_VERSION,
  createEmptyBaseline,
  parseBaseline,
  serializeBaseline,
} from './serialization/format.js';
export { loadBaseline, resolveBaselinePath } from './serialization/read.js';
export { saveBaseline } from './serialization/write.js';
export { applyBaseline } from './matching/apply.js';
export { mergeIntoBaseline, pruneBaseline } from './matching/merge.js';
export { reconcileRenames } from './matching/reconcile.js';
export { summarizeBaseline } from './summary.js';
