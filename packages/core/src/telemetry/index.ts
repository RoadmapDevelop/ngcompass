/**
 * Structured Telemetry
 *
 * Opt-in observability system for the analysis pipeline.
 * Records timing and cache effectiveness data across all three phases
 * (config, planner, engine) without adding mandatory overhead.
 *
 * Usage:
 *   const collector = createTelemetryCollector(config.telemetry);
 *   const result = await withTelemetry(collector, { phase: 'engine', operation: 'runAnalysis' }, fn);
 *   const events = collector.getEvents();
 */

// ============================================================
// TYPES
// ============================================================

export type TelemetryPhase = 'config' | 'planner' | 'engine';

export interface TelemetryEvent {
    readonly phase: TelemetryPhase;
    readonly operation: string;
    readonly durationMs: number;
    readonly cacheHit?: boolean;
    readonly workerId?: number;
    /** Arbitrary extra metadata (rule name, file count, task count, etc.) */
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export type TelemetryListener = (event: TelemetryEvent) => void;

export interface TelemetryCollector {
    emit(event: TelemetryEvent): void;
    /** Subscribe to events. Returns an unsubscribe function. */
    onEvent(listener: TelemetryListener): () => void;
    getEvents(): ReadonlyArray<TelemetryEvent>;
    clear(): void;
    readonly enabled: boolean;
}

// ============================================================
// IMPLEMENTATIONS
// ============================================================

/**
 * No-op collector — zero overhead when telemetry is disabled.
 */
export class NoOpTelemetryCollector implements TelemetryCollector {
    readonly enabled = false;
    emit(_event: TelemetryEvent): void { /* intentionally empty */ }
    onEvent(_listener: TelemetryListener): () => void { return () => { /* no-op */ }; }
    getEvents(): ReadonlyArray<TelemetryEvent> { return []; }
    clear(): void { /* intentionally empty */ }
}

/**
 * In-memory collector — accumulates events for the duration of a run.
 * For file or callback output, wrap this with a listener via onEvent().
 */
export class InMemoryTelemetryCollector implements TelemetryCollector {
    readonly enabled = true;
    private readonly _events: TelemetryEvent[] = [];
    private readonly _listeners = new Set<TelemetryListener>();

    emit(event: TelemetryEvent): void {
        this._events.push(event);
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch {
                // Listeners must not crash the pipeline
            }
        }
    }

    onEvent(listener: TelemetryListener): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    getEvents(): ReadonlyArray<TelemetryEvent> {
        return this._events;
    }

    clear(): void {
        this._events.length = 0;
    }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Creates the appropriate collector based on telemetry configuration.
 *
 * @param config - Telemetry config from NormalizedAnalyzerConfig
 */
export function createTelemetryCollector(
    config?: { enabled?: boolean; onEvent?: TelemetryListener }
): TelemetryCollector {
    if (!config?.enabled) {
        return new NoOpTelemetryCollector();
    }

    const collector = new InMemoryTelemetryCollector();

    if (config.onEvent) {
        collector.onEvent(config.onEvent);
    }

    return collector;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Wraps an async function with telemetry timing.
 *
 * Emits a TelemetryEvent after the function resolves (or rejects).
 * On rejection the event is still emitted with the elapsed duration,
 * and the error is re-thrown.
 */
export async function withTelemetry<T>(
    collector: TelemetryCollector,
    event: Omit<TelemetryEvent, 'durationMs'>,
    fn: () => Promise<T>
): Promise<T> {
    if (!collector.enabled) {
        return fn();
    }

    const start = performance.now();
    try {
        const result = await fn();
        collector.emit({ ...event, durationMs: performance.now() - start });
        return result;
    } catch (err) {
        collector.emit({ ...event, durationMs: performance.now() - start });
        throw err;
    }
}

/**
 * Synchronous variant of withTelemetry for lightweight operations.
 */
export function withTelemetrySync<T>(
    collector: TelemetryCollector,
    event: Omit<TelemetryEvent, 'durationMs'>,
    fn: () => T
): T {
    if (!collector.enabled) {
        return fn();
    }

    const start = performance.now();
    try {
        const result = fn();
        collector.emit({ ...event, durationMs: performance.now() - start });
        return result;
    } catch (err) {
        collector.emit({ ...event, durationMs: performance.now() - start });
        throw err;
    }
}
