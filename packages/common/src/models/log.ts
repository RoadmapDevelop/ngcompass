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

export interface LiveRedraw {
  clear(): void;
  redraw(): void;
}
