const MS_PER_SECOND = 1000;

export const formatDuration = (ms: number): string => {
  if (ms < MS_PER_SECOND) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
};

export const pluralise = (count: number, word: string): string =>
  count === 1 ? word : `${word}s`;
