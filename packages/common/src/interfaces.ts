/**
 * Interface definitions
 */

import type { Violation, RuleCategory, Severity, AnalysisResult } from './types';
import type { SourceFile, TypeChecker, Program } from 'typescript';

/**
 * Rule metadata
 */
export interface RuleMetadata {
    id: string;
    name: string;
    description: string;
    category: RuleCategory;
    recommended: boolean;
    fixable: boolean;
    requiresTypeInformation: boolean;
    requiresTemplateAnalysis: boolean;
    defaultSeverity: Severity;
    configSchema?: Record<string, unknown>; // JSON Schema
}

/**
 * Rule configuration
 */
export interface RuleConfig {
    severity: Severity | 'off';
    options?: Record<string, unknown>;
}

/**
 * Context provided to rules during execution
 */
export interface RuleContext {
    sourceFile: SourceFile;
    filePath: string;
    program?: Program;
    typeChecker?: TypeChecker;
    configuration: Record<string, unknown>;
    projectRoot: string;
    angularVersion?: string;
}

/**
 * Rule implementation
 */
export interface Rule {
    metadata: RuleMetadata;

    /**
     * Analyze a source file and return violations
     */
    analyze(context: RuleContext): Violation[] | Promise<Violation[]>;
}

/**
 * Configuration file structure
 */
export interface AnalyzerConfig {
    extends?: string | string[];
    rules?: Record<string, RuleConfig | Severity | 'off'>;
    overrides?: ConfigOverride[];
    include?: string[];
    exclude?: string[];
    cache?: boolean;
    cacheLocation?: string;
    maxWorkers?: number;
    parserOptions?: {
        project?: string;
        tsconfigRootDir?: string;
    };
}

/**
 * Configuration override for specific files
 */
export interface ConfigOverride {
    files: string | string[];
    rules?: Record<string, RuleConfig | Severity | 'off'>;
}

/**
 * Reporter interface
 */
export interface Reporter {
    name: string;

    /**
     * Generate report from analysis results
     */
    report(result: AnalysisResult): string | Promise<string>;
}