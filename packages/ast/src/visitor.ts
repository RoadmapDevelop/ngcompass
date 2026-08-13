const NON_CHILD_KEYS = new Set([
  'parent',
  'span',
  'loc',
  'range',
  'start',
  'end',
  'type',
]);

interface TraversableNode {
  readonly type: string;
}

const isTraversableNode = (value: unknown): value is TraversableNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

export const walkProgram = (
  root: TraversableNode | null | undefined,
  visitor: (node: TraversableNode) => void | boolean
): void => {
  if (!root) return;

  const stack: TraversableNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (visitor(node) === false) continue;

    const children: TraversableNode[] = [];
    const nodeRecord = node as unknown as Record<string, unknown>;

    for (const key in nodeRecord) {
      if (NON_CHILD_KEYS.has(key)) continue;
      const val = nodeRecord[key];
      if (!val || typeof val !== 'object') continue;

      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const child = val[i];
          if (isTraversableNode(child)) children.push(child);
        }
      } else if (isTraversableNode(val)) {
        children.push(val);
      }
    }

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
};
