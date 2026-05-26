import pc from 'picocolors';

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

const KNOWN_NAMESPACES: ReadonlySet<string> = new Set<string>([
  'discovery',
  'loader',
  'validator',
  'cache',
  'scanner',
  'parser',
  'rules',
  'workers',
  'reporter',
  'init',
  'config',
  'planner',
  'incremental',
  'dry-run',
  'engine',
  'plugin-loader',
  'env-fingerprint',
] satisfies Namespace[]);

const KNOWN_NAMESPACE_LIST = [...KNOWN_NAMESPACES].join(', ');

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
  pc.blueBright,
];

function getNamespaceColor(namespace: string) {
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    hash = namespace.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
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

    const namespaces = this.parseNamespaces(debugEnv);

    const enabled = namespaces === 'all' || namespaces.size > 0;

    return {
      enabled,
      level: 'debug',
      namespaces,
      showTimestamps: false,
      showTimings: true,
    };
  }

  public enable(
    level: LogLevel = 'debug',
    namespaces: Namespace[] | 'all' = 'all'
  ) {
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

  public debug(namespace: Namespace, message: string, ...args: unknown[]) {
    this.log('debug', namespace, message, ...args);
  }

  public info(namespace: Namespace, message: string, ...args: unknown[]) {
    this.log('info', namespace, message, ...args);
  }

  public warn(namespace: Namespace, message: string, ...args: unknown[]) {
    this.log('warn', namespace, message, ...args);
  }

  public error(namespace: Namespace, message: string, ...args: unknown[]) {
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

  public timeLog(
    label: string,
    namespace: Namespace,
    message?: string
  ): number {
    const duration = this.timeEnd(label);
    if (duration > 0 && message) {
      this.debug(namespace, `${message}: ${duration.toFixed(1)}ms`);
    }
    return duration;
  }

  private log(
    _level: LogLevel,
    namespace: Namespace,
    message: string,
    ...args: unknown[]
  ) {
    if (!this.config.enabled) return;
    if (
      this.config.namespaces !== 'all' &&
      !this.config.namespaces.has(namespace)
    )
      return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const colorFn = getNamespaceColor(namespace);
    const prefix = `${pc.gray(`[${timeStr}]`)} ${colorFn(`[ngcompass:${namespace}]`)}`;
    const timestamp = this.config.showTimestamps
      ? pc.gray(`[${now.toISOString()}] `)
      : '';

    console.error(`${timestamp}${prefix} ${message}`, ...args);
  }

  private parseNamespaces(debugEnv: string): Set<Namespace> | 'all' {
    if (
      debugEnv === '*' ||
      debugEnv === 'ngcompass' ||
      debugEnv === 'ngcompass:*'
    ) {
      return 'all';
    }

    const parts = debugEnv.split(',').map((s) => s.trim());
    const namespaces = new Set<Namespace>();

    for (const part of parts) {
      if (!part.startsWith('ngcompass:')) continue;

      const ns = part.slice('ngcompass:'.length);

      if (KNOWN_NAMESPACES.has(ns)) {
        namespaces.add(ns as Namespace);
      } else if (ns.length > 0) {
        console.warn(
          `[ngcompass] Unknown debug namespace: "${ns}". ` +
            `Valid namespaces: ${KNOWN_NAMESPACE_LIST}`
        );
      }
    }

    return namespaces;
  }
}

const logger = new Logger();

export const debug = (
  namespace: Namespace,
  message: string,
  ...args: unknown[]
) => logger.debug(namespace, message, ...args);

export const info = (
  namespace: Namespace,
  message: string,
  ...args: unknown[]
) => logger.info(namespace, message, ...args);

export const warn = (
  namespace: Namespace,
  message: string,
  ...args: unknown[]
) => logger.warn(namespace, message, ...args);

export const error = (
  namespace: Namespace,
  message: string,
  ...args: unknown[]
) => logger.error(namespace, message, ...args);

export const time = (label: string) => logger.time(label);

export const timeEnd = (label: string) => logger.timeEnd(label);

export const timeLog = (
  label: string,
  namespace: Namespace,
  message?: string
) => logger.timeLog(label, namespace, message);

export const enableDebug = (
  level?: LogLevel,
  namespaces?: Namespace[] | 'all'
) => logger.enable(level, namespaces);

export const disableDebug = () => logger.disable();

export const isDebugEnabled = () => logger.isEnabled();

export default logger;
