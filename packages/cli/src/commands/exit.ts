import pc from 'picocolors';

function formatErrorDetail(detail: unknown): string {
  return detail instanceof Error ? detail.message : String(detail);
}

export function restoreCursor(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write('[?25h');
}

export function exitWithError(code = 1): never {
  restoreCursor();
  process.exit(code);
}

export function printError(message: string, detail?: unknown): void {
  const tail = detail === undefined ? '' : `: ${formatErrorDetail(detail)}`;
  console.error(`${pc.red(message)}${tail}`);
}
