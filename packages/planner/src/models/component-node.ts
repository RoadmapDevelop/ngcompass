import type { FileType } from './file.js';

export interface ComponentNode {
  tsPath: string;
  templatePath?: string;
  stylePaths: string[];
  specPath?: string;
  type: FileType;
}
