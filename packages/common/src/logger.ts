/**
 * Global Logger Module
 *
 * Provides debug and performance logging capabilities with namespace filtering.
 * Follows industry standards (ESLint, TypeScript debug patterns).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
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
    | 'watch'
    | 'autofix'
    | 'init'
    | 'config'
    | 'planner'
    | 'incremental'
    | 'dry-run'
    | 'mock-executor';

interface LoggerConfig {
    enabled: boolean;
    level: LogLevel;
    namespaces: Set<Namespace> | 'all';
    showTimestamps: boolean;
    showTimings: boolean;
}

class Logger {
    private config: LoggerConfig;
    private timers: Map<string, number>;

    constructor() {
        this.config = this.initializeFromEnv();
        this.timers = new Map();
    }

    private initializeFromEnv(): LoggerConfig {
        const debugEnv = process.env.DEBUG || '';
        const enabled = debugEnv.includes('ngcompass') || debugEnv === '*';

        // Parse namespaces from DEBUG=ngcompass:loader,ngcompass:cache
        const namespaces = this.parseNamespaces(debugEnv);

        return {
            enabled,
            level: 'debug',
            namespaces,
            showTimestamps: false, // Keep output clean by default
            showTimings: true
        };
    }

    public enable(level: LogLevel = 'debug', namespaces: Namespace[] | 'all' = 'all') {
        this.config.enabled = true;
        this.config.level = level;
        this.config.namespaces = namespaces === 'all' ? 'all' : new Set(namespaces);
    }

    public disable() {
        this.config.enabled = false;
    }

    public isEnabled(): boolean {
        return this.config.enabled;
    }

    public debug(namespace: Namespace, message: string, ...args: any[]) {
        this.log('debug', namespace, message, ...args);
    }

    public info(namespace: Namespace, message: string, ...args: any[]) {
        this.log('info', namespace, message, ...args);
    }

    public warn(namespace: Namespace, message: string, ...args: any[]) {
        this.log('warn', namespace, message, ...args);
    }

    public error(namespace: Namespace, message: string, ...args: any[]) {
        this.log('error', namespace, message, ...args);
    }

    public time(label: string) {
        if (!this.config.enabled) return;
        this.timers.set(label, performance.now());
    }

    public timeEnd(label: string): number {
        if (!this.config.enabled) return 0;

        const start = this.timers.get(label);
        if (!start) return 0;

        const duration = performance.now() - start;
        this.timers.delete(label);
        return duration;
    }

    public timeLog(label: string, namespace: Namespace, message?: string): number {
        const duration = this.timeEnd(label);
        if (duration > 0 && message) {
            this.debug(namespace, `${message}: ${duration.toFixed(1)}ms`);
        }
        return duration;
    }

    private log(_level: LogLevel, namespace: Namespace, message: string, ...args: any[]) {
        if (!this.config.enabled) return;
        if (this.config.namespaces !== 'all' && !this.config.namespaces.has(namespace)) return;

        const prefix = `[ngcompass:${namespace}]`;
        const timestamp = this.config.showTimestamps ? `[${new Date().toISOString()}]` : '';

        // Use stderr to keep stdout clean for actual output
        console.error(`${timestamp}${prefix} ${message}`, ...args);
    }

    private parseNamespaces(debugEnv: string): Set<Namespace> | 'all' {
        if (debugEnv === '*' || debugEnv === 'ngcompass' || debugEnv === 'ngcompass:*') {
            return 'all';
        }

        const parts = debugEnv.split(',').map(s => s.trim());
        const namespaces = new Set<Namespace>();

        for (const part of parts) {
            if (part.startsWith('ngcompass:')) {
                const ns = part.replace('ngcompass:', '') as Namespace;
                namespaces.add(ns);
            }
        }

        return namespaces.size > 0 ? namespaces : 'all';
    }
}

// Singleton instance
const logger = new Logger();

// Convenience exports
export const debug = (namespace: Namespace, message: string, ...args: any[]) =>
    logger.debug(namespace, message, ...args);

export const info = (namespace: Namespace, message: string, ...args: any[]) =>
    logger.info(namespace, message, ...args);

export const warn = (namespace: Namespace, message: string, ...args: any[]) =>
    logger.warn(namespace, message, ...args);

export const error = (namespace: Namespace, message: string, ...args: any[]) =>
    logger.error(namespace, message, ...args);

export const time = (label: string) =>
    logger.time(label);

export const timeEnd = (label: string) =>
    logger.timeEnd(label);

export const timeLog = (label: string, namespace: Namespace, message?: string) =>
    logger.timeLog(label, namespace, message);

export const enableDebug = (level?: LogLevel, namespaces?: Namespace[] | 'all') =>
    logger.enable(level, namespaces);

export const disableDebug = () =>
    logger.disable();

export const isDebugEnabled = () =>
    logger.isEnabled();

export default logger;
