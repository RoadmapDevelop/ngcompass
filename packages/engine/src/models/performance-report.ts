export interface RuleTiming {
  ruleName: string;
  totalMs: number;
  invocations: number;
}

export interface PerformanceReport {
  traversalMs: number;
  nodesVisited: number;
  ruleTimings: RuleTiming[];
  cacheStats: { hits: number; misses: number };
  budgetViolations: string[];
  hasBudgetViolations: boolean;
}
