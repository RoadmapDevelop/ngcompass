import process from 'node:process';
import pc from 'picocolors';

export type BlockTone = 'error' | 'muted';

const DEFAULT_WIDTH = 80;
const LABEL_PADDING = 4;

export function buildLabeledDivider(label: string, tone: BlockTone): string {
  const visibleLabel = `   ${label}   `;
  const styledLabel = `  ${paintBadge(label, tone)}  `;
  const width = process.stdout.columns ?? DEFAULT_WIDTH;
  const sides = Math.max(0, width - visibleLabel.length);
  const left = Math.floor(sides / 2);
  const right = sides - left;
  const paintDots = tone === 'error' ? pc.red : pc.cyan;

  return (
    paintDots('·'.repeat(left)) + styledLabel + paintDots('·'.repeat(right))
  );
}

export function buildIndexedSeparator(index: number, total: number): string {
  const visibleLabel = ` ${index}/${total} `;
  const styledLabel = `  ${pc.bgWhite(pc.black(pc.bold(visibleLabel)))}  `;
  const width = process.stdout.columns ?? DEFAULT_WIDTH;
  const dotCount = Math.max(0, width - (visibleLabel.length + LABEL_PADDING));

  return pc.dim('·'.repeat(dotCount)) + styledLabel;
}

export function buildFileBadge(
  label: string,
  tone: BlockTone,
  filePath: string
): string {
  return `${paintBadge(label, tone)} ${filePath}`;
}

function paintBadge(label: string, tone: BlockTone): string {
  const padded = ` ${label} `;
  return tone === 'error'
    ? pc.bgRed(pc.white(pc.bold(padded)))
    : pc.bgCyan(pc.black(pc.bold(padded)));
}
