export type ScanPhase =
  | 'normalizing'
  | 'discovering'
  | 'filtering'
  | 'calculating-stats'
  | 'complete';

export type OnProgressCallback = (phase: ScanPhase, count: number) => void;
