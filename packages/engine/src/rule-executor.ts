import type {
  BatchRuleExecutorFn,
  RuleCheckerFn,
} from './models/index.js';

const _unConfiguredMsg =
  '[ngcompass] Rule executor not configured. ' +
  'Call configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule) ' +
  'before running analysis.';

let _executor: BatchRuleExecutorFn = () => {
  throw new Error(_unConfiguredMsg);
};
let _checker: RuleCheckerFn = () => false;

export function configureRuleExecutor(
  executor: BatchRuleExecutorFn,
  checker: RuleCheckerFn
): void {
  _executor = executor;
  _checker = checker;
}

export function getConfiguredExecutor(): BatchRuleExecutorFn {
  return _executor;
}

export function getConfiguredChecker(): RuleCheckerFn {
  return _checker;
}
