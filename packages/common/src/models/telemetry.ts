export interface TelemetryEventBase {
  readonly phase: 'config' | 'planner' | 'engine';
  readonly operation: string;
  readonly durationMs: number;
  readonly cacheHit?: boolean;
  readonly workerId?: number;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface TelemetryConfig {
  enabled?: boolean;

  onEvent?: (event: TelemetryEventBase) => void;
}
