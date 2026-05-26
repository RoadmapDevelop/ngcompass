import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE_URL_RE = /templateUrl\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URL_RE = /\bstyleUrl(?!s)\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URLS_RE = /\bstyleUrls\s*:\s*\[([^\]]+)\]/;
const STYLE_STR_RE = /['"`]([^'"`\n]+\.(?:css|scss|sass|less))['"`]/g;

export const extractTemplateUrl = async (
  tsPath: string,
  dir: string,
  fileSet?: Set<string>
): Promise<string | undefined> => {
  try {
    const content = await readFile(tsPath, 'utf-8');
    const match = TEMPLATE_URL_RE.exec(content);
    if (!match) return undefined;
    const resolved = path.resolve(dir, match[1]);
    if (fileSet && !fileSet.has(resolved)) return undefined;
    return resolved;
  } catch {
    return undefined;
  }
};

export const extractStyleUrls = async (
  tsPath: string,
  dir: string,
  fileSet?: Set<string>
): Promise<string[]> => {
  try {
    const content = await readFile(tsPath, 'utf-8');
    const results: string[] = [];

    const singleMatch = STYLE_URL_RE.exec(content);
    if (singleMatch) {
      const resolved = path.resolve(dir, singleMatch[1]);
      if (!fileSet || fileSet.has(resolved)) results.push(resolved);
    }

    const arrayMatch = STYLE_URLS_RE.exec(content);
    if (arrayMatch) {
      STYLE_STR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STYLE_STR_RE.exec(arrayMatch[1])) !== null) {
        const resolved = path.resolve(dir, m[1]);
        if (!fileSet || fileSet.has(resolved)) results.push(resolved);
      }
    }

    return results;
  } catch {
    return [];
  }
};
