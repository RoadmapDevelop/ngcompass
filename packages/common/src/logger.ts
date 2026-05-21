/**
 * @fileoverview
 * Namespaced debug logger shared by every package.
 *
 * Provides leveled (`debug`/`info`/`warn`/`error`) logging gated by the
 * `DEBUG` environment variable using ESLint/TypeScript-style namespace
 * filtering (`DEBUG=ngcompass:scanner,ngcompass:planner`), plus a
 * `time`/`timeEnd` timer registry for ad-hoc performance measurement.
 *
 * The module exports a singleton plus convenience function wrappers so
 * call sites can `import { debug } from '@ngcompass/common'` instead of
 * threading a logger instance through every layer.
 */

import pc from 'picocolors';

/** Log levels accepted by the shared debug logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Debug namespace names that map to analyzer subsystems.
 *
 * Namespace filtering lets users inspect one pipeline layer without turning
 * every package into a noisy stderr stream.
 */
export type Namespace =
    | 'discovery'
    | 'loader'
    | 'validator'
    | 'cache'
    | 'scanner'
    | 'parser'
    | 'rules'
    | 'workers'
    | 'reporter'
    | 'init'
    | 'config'
    | 'planner'
    | 'incremental'
    | 'dry-run'
    | 'engine'
    | 'plugin-loader'
    | 'env-fingerprint';

interface LoggerConfig {
    enabled: boolean;
    level: LogLevel;
    namespaces: Set<Namespace> | 'all';
    showTimestamps: boolean;
    showTimings: boolean;
}

/**
 * Runtime set of every valid debug namespace.
 *
 * `satisfies Namespace[]` is a compile-time guard: TypeScript will error if any string
 * literal here drifts out of sync with the `Namespace` union above, so this array stays
 * authoritative without duplication risk.
 *
 * Declared as `ReadonlySet<string>` (not `Set<Namespace>`) so that
 * `KNOWN_NAMESPACES.has(runtimeString)` is accepted by TypeScript without a cast.
 */
const KNOWN_NAMESPACES: ReadonlySet<string> = new Set<string>(
    [
        'discovery', 'loader', 'validator', 'cache', 'scanner', 'parser',
        'rules', 'workers', 'reporter', 'init', 'config',
        'planner', 'incremental', 'dry-run', 'engine', 'plugin-loader', 'env-fingerprint',
    ] satisfies Namespace[]
);

const COLORS = [
    pc.cyan,
    pc.green,
    pc.yellow,
    pc.blue,
    pc.magenta,
    pc.magentaBright,
    pc.cyanBright,
    pc.greenBright,
    pc.yellowBright,
    pc.blueBright
];

/**
 * Picks a stable color for a namespace using a small deterministic hash.
 *
 * @param namespace - Debug namespace being rendered.
 * @returns A picocolors formatter function.
 */
function getNamespaceColor(namespace: string) {
    let hash = 0;
    for (let i = 0; i < namespace.length; i++) {
        hash = namespace.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Mutable debug logger used behind the module-level convenience exports.
 *
 * The class is intentionally private to keep the public API small and avoid
 * downstream packages depending on logger internals.
 */
class Logger {
    private config: LoggerConfig;
    private timers: Map<string, number>;

    constructor() {
        this.config = this.initializeFromEnv();
        this.timers = new Map();
    }

    private initializeFromEnv(): LoggerConfig {
        const debugEnv = process.env.DEBUG || '';

        // Parse namespaces first; enabled is derived from the result, not from a
        // fragile string-includes check that would silently enable everything on a typo.
        const namespaces = this.parseNamespaces(debugEnv);

        // Logger is active only when at least one namespace matched or 'all' was requested.
        // An empty set means the user wrote e.g. DEBUG=ngcompass:typo and no namespace
        // was recognized, so we stay silent rather than flooding unintended output.
        const enabled = namespaces === 'all' || namespaces.size > 0;

        return {
            enabled,
            level: 'debug',
            namespaces,
            showTimestamps: false, // Keep output clean by default
            showTimings: true
        };
    }

    /** Enables debug output for all namespaces or a selected namespace list. */
    public enable(level: LogLevel = 'debug', namespaces: Namespace[] | 'all' = 'all') {
        this.config.enabled = true;
        this.config.level = level;
        this.config.namespaces = namespaces === 'all' ? 'all' : new Set(namespaces);
    }

    /** Disables debug output and leaves existing timer state untouched. */
    public disable() {
        this.config.enabled = false;
    }

    /** Returns whether any namespace is currently enabled for logging. */
    public isEnabled(): boolean {
        return this.config.enabled;
    }

    /** Writes a debug-level message to stderr when its namespace is enabled. */
    public debug(namespace: Namespace, message: string, ...args: unknown[]) {
        this.log('debug', namespace, message, ...args);
    }

    /** Writes an info-level message to stderr when its namespace is enabled. */
    public info(namespace: Namespace, message: string, ...args: unknown[]) {
        this.log('info', namespace, message, ...args);
    }

    /** Writes a warning-level message to stderr when its namespace is enabled. */
    public warn(namespace: Namespace, message: string, ...args: unknown[]) {
        this.log('warn', namespace, message, ...args);
    }

    /** Writes an error-level message to stderr when its namespace is enabled. */
    public error(namespace: Namespace, message: string, ...args: unknown[]) {
        this.log('error', namespace, message, ...args);
    }

    /** Starts or resets a named timer when debug output is enabled. */
    public time(label: string) {
        if (!this.config.enabled) return;
        this.timers.set(label, performance.now());
    }

    /** Ends a named timer and returns its elapsed milliseconds. */
    public timeEnd(label: string): number {
        if (!this.config.enabled) return 0;

        const start = this.timers.get(label);
        if (!start) return 0;

        const duration = performance.now() - start;
        this.timers.delete(label);
        return duration;
    }

    /** Ends a named timer and logs the elapsed duration with a message. */
    public timeLog(label: string, namespace: Namespace, message?: string): number {
        const duration = this.timeEnd(label);
        if (duration > 0 && message) {
            this.debug(namespace, `${message}: ${duration.toFixed(1)}ms`);
        }
        return duration;
    }

    private log(_level: LogLevel, namespace: Namespace, message: string, ...args: unknown[]) {
        if (!this.config.enabled) return;
        if (this.config.namespaces !== 'all' && !this.config.namespaces.has(namespace)) return;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const colorFn = getNamespaceColor(namespace);
        const prefix = `${pc.gray(`[${timeStr}]`)} ${colorFn(`[ngcompass:${namespace}]`)}`;
        const timestamp = this.config.showTimestamps ? pc.gray(`[${now.toISOString()}] `) : '';

        console.error(`${timestamp}${prefix} ${message}`, ...args);
    }

    private parseNamespaces(debugEnv: string): Set<Namespace> | 'all' {
        // Wildcard or bare tool name enables every namespace.
        if (debugEnv === '*' || debugEnv === 'ngcompass' || debugEnv === 'ngcompass:*') {
            return 'all';
        }

        const parts = debugEnv.split(',').map(s => s.trim());
        const namespaces = new Set<Namespace>();

        for (const part of parts) {
            if (!part.startsWith('ngcompass:')) continue;

            const ns = part.slice('ngcompass:'.length);

            if (KNOWN_NAMESPACES.has(ns)) {
                namespaces.add(ns as Namespace);
            } else if (ns.length > 0) {
                // Warn once per unrecognized token so the user can fix the typo.
                // Uses console.warn directly (not the logger itself) to avoid recursion.
                console.warn(
                    `[ngcompass] Unknown debug namespace: "${ns}". ` +
                    `Valid namespaces: ${[...KNOWN_NAMESPACES].join(', ')}`
                );
            }
        }

        // Always return the set; never fall back to 'all' for an empty/unmatched result.
        // An empty set here means nothing matched; initializeFromEnv will set enabled=false.
        return namespaces;
    }
}

// Singleton instance shared across module-level wrapper exports.
const logger = new Logger();

/** Logs a debug-level message for an enabled namespace. */
export const debug = (namespace: Namespace, message: string, ...args: unknown[]) =>
    logger.debug(namespace, message, ...args);

/** Logs an info-level message for an enabled namespace. */
export const info = (namespace: Namespace, message: string, ...args: unknown[]) =>
    logger.info(namespace, message, ...args);

/** Logs a warning-level message for an enabled namespace. */
export const warn = (namespace: Namespace, message: string, ...args: unknown[]) =>
    logger.warn(namespace, message, ...args);

/** Logs an error-level message for an enabled namespace. */
export const error = (namespace: Namespace, message: string, ...args: unknown[]) =>
    logger.error(namespace, message, ...args);

/** Starts or resets a named timer when debug output is enabled. */
export const time = (label: string) =>
    logger.time(label);

/** Ends a named timer and returns elapsed milliseconds, or `0` if inactive. */
export const timeEnd = (label: string) =>
    logger.timeEnd(label);

/** Ends a named timer and logs the elapsed duration under a namespace. */
export const timeLog = (label: string, namespace: Namespace, message?: string) =>
    logger.timeLog(label, namespace, message);

/** Enables debug output for all namespaces or a selected namespace list. */
export const enableDebug = (level?: LogLevel, namespaces?: Namespace[] | 'all') =>
    logger.enable(level, namespaces);

/** Disables debug output. */
export const disableDebug = () =>
    logger.disable();

/** Returns whether debug output is currently enabled. */
export const isDebugEnabled = () =>
    logger.isEnabled();

/** Shared logger singleton for callers that need the object API. */
export default logger;
