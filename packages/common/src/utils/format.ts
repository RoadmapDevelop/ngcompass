export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function pluralise(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
