import path from 'node:path';
import type { FileType } from './models/index.js';

export const ANGULAR_DECORATOR_RE =
  /\@(Component|Directive|Pipe|Injectable|NgModule)\s*[\(\{]/;

export const detectFileType = (filePath: string): FileType => {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath);

  if (basename.endsWith('.component.ts')) return 'component';
  if (basename.endsWith('.directive.ts')) return 'directive';
  if (basename.endsWith('.pipe.ts')) return 'pipe';
  if (basename.endsWith('.service.ts')) return 'service';
  if (basename.endsWith('.module.ts')) return 'module';
  if (basename.endsWith('.guard.ts')) return 'guard';

  if (ext === '.html') return 'template';
  if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less')
    return 'style';
  if (basename.endsWith('.config.ts') || ext === '.json') return 'config';

  if (basename.endsWith('.spec.ts') || basename.endsWith('.test.ts'))
    return 'spec';

  if (ext === '.ts') return 'logic';

  return 'unknown';
};

export const isTypeScriptFile = (filePath: string): boolean => {
  return path.extname(filePath) === '.ts';
};

export const isTemplateFile = (filePath: string): boolean => {
  return path.extname(filePath) === '.html';
};

export const isStyleFile = (filePath: string): boolean => {
  const ext = path.extname(filePath);
  return (
    ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less'
  );
};

export const isSpecFile = (filePath: string): boolean => {
  return path.basename(filePath).endsWith('.spec.ts');
};

export const isComponentFile = (filePath: string): boolean => {
  return path.basename(filePath).endsWith('.component.ts');
};

export const getBaseName = (filePath: string): string => {
  const basename = path.basename(filePath);

  const suffixes = [
    '.component.ts',
    '.directive.ts',
    '.pipe.ts',
    '.service.ts',
    '.module.ts',
    '.guard.ts',
    '.spec.ts',
  ];

  for (const suffix of suffixes) {
    if (basename.endsWith(suffix)) {
      return basename.slice(0, -suffix.length);
    }
  }

  return path.basename(filePath, path.extname(filePath));
};
