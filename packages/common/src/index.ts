/**
 * @angular-analyzer/common
 *
 * Common types, interfaces, and utilities shared across all packages
 */

export const common = '@ngcompass/common';
// Core types
export * from './constants';
export {
    InitResult,
    NormalizedAnalyzerConfig,
    ConfigValidationResult,
    ConfigReport,
    CacheOptions,
    FailSeverity,
    OutputFormat,
    ConfigIssue,
    HealthReport,
    RuleConfig
} from './interfaces.js';
export * from './errors';
export * from './types';
export * from './ast/utils';
export * from './logger';
