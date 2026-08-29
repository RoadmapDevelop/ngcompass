import type { Node } from './ts-node.js';

export interface TemplateBlock extends Node {
  readonly type: 'Block';
  readonly name: string;
  readonly parameters: ReadonlyArray<TemplateBlockParameter>;
  readonly children: ReadonlyArray<Node>;
}

export interface TemplateBlockParameter extends Node {
  readonly type: 'BlockParameter';
  readonly expression: string;
}
