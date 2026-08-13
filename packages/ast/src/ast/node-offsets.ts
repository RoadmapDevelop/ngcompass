import type { Node } from '../models/index.js';

export const nodeStart = (node: Pick<Node, 'start' | 'span'>): number =>
  node.start ?? node.span?.start ?? 0;

export const nodeEnd = (node: Pick<Node, 'end' | 'span'>): number =>
  node.end ?? node.span?.end ?? 0;
