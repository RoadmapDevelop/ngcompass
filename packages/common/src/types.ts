/**
 * Core type definitions
 */

/**
 * Severity levels for violations
 */
export enum Severity {
    Error = 'error',
    Warning = 'warning',
    Suggestion = 'suggestion',
    Info = 'info',
}

/**
 * Rule categories for organization
 */
export enum RuleCategory {
    Architecture = 'architecture',
    Performance = 'performance',
    SSR = 'ssr',
    Security = 'security',
    Accessibility = 'accessibility',
    Testing = 'testing',
    CodeSmell = 'code-smell',
    Reactivity = 'reactivity',
    BestPractice = 'best-practice',
}

/**
 * Position in source code
 */
export interface Position {
    line: number;
    column: number;
}

/**
 * Range in source code
 */
export interface Range {
    start: Position;
    end: Position;
}

/**
 * Location information for violations
 */
export interface Location {
    filePath: string;
    range: Range;
}

/**
 * Text edit for auto-fixing
 */
export interface TextEdit {
    range: Range;
    newText: string;
}

/**
 * Rule violation/diagnostic
 */
export interface Violation {
    ruleId: string;
    message: string;
    severity: Severity;
    location: Location;
    fix?: TextEdit[];
    relatedInformation?: {
        location: Location;
        message: string;
    }[];
}

/**
 * Analysis result for a file
 */
export interface FileAnalysisResult {
    filePath: string;
    violations: Violation[];
    parseErrors?: string[];
    analysisTime?: number;
}

/**
 * Overall analysis result
 */
export interface AnalysisResult {
    files: FileAnalysisResult[];
    summary: {
        totalFiles: number;
        filesWithViolations: number;
        totalViolations: number;
        errorCount: number;
        warningCount: number;
        suggestionCount: number;
    };
    timing: {
        total: number;
        parsing: number;
        analysis: number;
        reporting: number;
    };
}