import pc from 'picocolors';

export const restoreCursor = (): void => {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1B[?25h');
};

export const exitWithError = (code = 1): never => {
  restoreCursor();
  process.exit(code);
};

const formatErrorDetail = (detail: unknown): string => {
  return detail instanceof Error ? detail.message : String(detail);
};

export const printError = (message: string, detail?: unknown): void => {
  const tail = detail === undefined ? '' : `: ${formatErrorDetail(detail)}`;
  console.error(`${pc.red(message)}${tail}`);
};
