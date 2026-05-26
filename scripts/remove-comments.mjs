import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const isCheck = args.has('--check');
const isDryRun = args.has('--dry-run') || isCheck;
const isVerbose = args.has('--verbose');
const shouldHelp = args.has('--help') || args.has('-h');
const bom = '\uFEFF';
const skippedDirectories = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const skippedFiles = new Set(['pnpm-lock.yaml']);
const jsLikeExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const cssLikeExtensions = new Set(['.css', '.less', '.sass', '.scss']);
const htmlLikeExtensions = new Set(['.htm', '.html']);
const yamlExtensions = new Set(['.yaml', '.yml']);
const jsonLikeExtensions = new Set(['.json', '.json5', '.jsonc']);
const jsonLikeNames = new Set(['.prettierrc', '.swcrc']);
const hashCommentNames = new Set(['.gitignore', '.npmignore']);

if (shouldHelp) {
  process.stdout.write(
    [
      'Usage: node scripts/remove-comments.mjs [--check] [--dry-run] [--verbose]',
      '',
      'Removes comments from git-tracked source, test, script, and configuration files.',
      '--check exits non-zero when comments would be removed.',
      '--dry-run prints the same summary without writing files.',
      '--verbose prints every changed file.',
      '',
    ].join('\n')
  );
  process.exit(0);
}

function listGitFiles() {
  try {
    return execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8' }
    )
      .split('\0')
      .filter(Boolean);
  } catch {
    return walkFiles(root).map((filePath) =>
      path.relative(root, filePath).replaceAll(path.sep, '/')
    );
  }
}

function walkFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      files.push(...walkFiles(path.join(directory, entry.name)));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function shouldSkip(filePath) {
  const parts = filePath.split(/[\\/]/);
  for (const part of parts) {
    if (skippedDirectories.has(part)) {
      return true;
    }
  }
  return skippedFiles.has(filePath.replaceAll('\\', '/'));
}

function getKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);
  if (
    jsLikeExtensions.has(extension) ||
    jsonLikeExtensions.has(extension) ||
    jsonLikeNames.has(baseName)
  ) {
    return 'js';
  }
  if (cssLikeExtensions.has(extension)) {
    return 'css';
  }
  if (htmlLikeExtensions.has(extension)) {
    return 'html';
  }
  if (yamlExtensions.has(extension)) {
    return 'yaml';
  }
  if (hashCommentNames.has(baseName)) {
    return 'hash';
  }
  return undefined;
}

function stripWithBom(text, strip) {
  if (text.startsWith(bom)) {
    return bom + strip(text.slice(1));
  }
  return strip(text);
}

function replacementFor(value) {
  const newlineCount = countNewlines(value);
  if (newlineCount === 0) {
    return '';
  }
  return '\n'.repeat(newlineCount);
}

function countNewlines(value) {
  let count = 0;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) {
      count++;
    }
  }
  return count;
}

function stripJsLike(text) {
  return stripWithBom(text, stripJsComments);
}

function stripJsComments(body) {
  let next = '';
  let index = 0;
  let lastToken = 'start';
  while (index < body.length) {
    const char = body[index];
    const following = body[index + 1];
    if (index === 0 && char === '#' && following === '!') {
      const newline = body.indexOf('\n', index);
      const stop = newline === -1 ? body.length : newline;
      next += body.slice(index, stop);
      index = stop;
      continue;
    }
    if (isWhitespace(char)) {
      next += char;
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      const result = readQuoted(body, index, char);
      next += result.value;
      index = result.end;
      lastToken = 'value';
      continue;
    }
    if (char === '`') {
      const result = readTemplate(body, index);
      next += result.value;
      index = result.end;
      lastToken = 'value';
      continue;
    }
    if (char === '/' && following === '/') {
      const newline = body.indexOf('\n', index + 2);
      const stop = newline === -1 ? body.length : newline;
      next += replacementFor(body.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '/' && following === '*') {
      const end = body.indexOf('*/', index + 2);
      const stop = end === -1 ? body.length : end + 2;
      next += replacementFor(body.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '/' && canStartRegex(lastToken)) {
      const result = readRegex(body, index);
      next += result.value;
      index = result.end;
      lastToken = 'value';
      continue;
    }
    if (isIdentifierStart(char)) {
      const result = readIdentifier(body, index);
      next += result.value;
      index = result.end;
      lastToken = isExpressionKeyword(result.value) ? 'operator' : 'value';
      continue;
    }
    if (isDigit(char)) {
      const result = readNumber(body, index);
      next += result.value;
      index = result.end;
      lastToken = 'value';
      continue;
    }
    next += char;
    lastToken = classifyPunctuation(char);
    index++;
  }
  return next;
}

function readQuoted(body, start, quote) {
  let index = start + 1;
  while (index < body.length) {
    const char = body[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    index++;
    if (char === quote) {
      break;
    }
  }
  return { value: body.slice(start, index), end: index };
}

function readTemplate(body, start) {
  let index = start + 1;
  while (index < body.length) {
    const char = body[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    index++;
    if (char === '`') {
      break;
    }
  }
  return { value: body.slice(start, index), end: index };
}

function readRegex(body, start) {
  let index = start + 1;
  let isClass = false;
  while (index < body.length) {
    const char = body[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '[') {
      isClass = true;
      index++;
      continue;
    }
    if (char === ']') {
      isClass = false;
      index++;
      continue;
    }
    if (char === '/' && !isClass) {
      index++;
      while (isIdentifierPart(body[index] ?? '')) {
        index++;
      }
      break;
    }
    index++;
  }
  return { value: body.slice(start, index), end: index };
}

function readIdentifier(body, start) {
  let index = start + 1;
  while (isIdentifierPart(body[index] ?? '')) {
    index++;
  }
  return { value: body.slice(start, index), end: index };
}

function readNumber(body, start) {
  let index = start + 1;
  while (/[\w.$]/.test(body[index] ?? '')) {
    index++;
  }
  return { value: body.slice(start, index), end: index };
}

function canStartRegex(lastToken) {
  return lastToken !== 'value' && lastToken !== 'close';
}

function classifyPunctuation(char) {
  if (char === ')' || char === ']' || char === '}') {
    return 'close';
  }
  if (
    char === ';' ||
    char === ',' ||
    char === ':' ||
    char === '?' ||
    char === '(' ||
    char === '[' ||
    char === '{'
  ) {
    return 'operator';
  }
  return /[+\-*=!%&|^~<>]/.test(char) ? 'operator' : 'value';
}

function isExpressionKeyword(value) {
  return (
    value === 'return' ||
    value === 'throw' ||
    value === 'case' ||
    value === 'delete' ||
    value === 'typeof' ||
    value === 'void' ||
    value === 'new' ||
    value === 'in' ||
    value === 'of' ||
    value === 'yield' ||
    value === 'await'
  );
}

function isWhitespace(char) {
  return /\s/.test(char);
}

function isDigit(char) {
  return /[0-9]/.test(char);
}

function isIdentifierStart(char) {
  return /[$A-Z_a-z]/.test(char);
}

function isIdentifierPart(char) {
  return /[$0-9A-Z_a-z]/.test(char);
}

function stripBlockComments(text) {
  return stripWithBom(text, (body) => {
    let next = '';
    let index = 0;
    let quote;
    while (index < body.length) {
      const char = body[index];
      const following = body[index + 1];
      if (quote) {
        next += char;
        if (char === '\\') {
          next += following ?? '';
          index += 2;
          continue;
        }
        if (char === quote) {
          quote = undefined;
        }
        index++;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        next += char;
        index++;
        continue;
      }
      if (char === '/' && following === '*') {
        const end = body.indexOf('*/', index + 2);
        const stop = end === -1 ? body.length : end + 2;
        next += replacementFor(body.slice(index, stop));
        index = stop;
        continue;
      }
      next += char;
      index++;
    }
    return next;
  });
}

function stripHtmlComments(text) {
  return stripWithBom(text, (body) => {
    let next = '';
    let cursor = 0;
    while (cursor < body.length) {
      const start = body.indexOf('<!--', cursor);
      if (start === -1) {
        next += body.slice(cursor);
        break;
      }
      const end = body.indexOf('-->', start + 4);
      const stop = end === -1 ? body.length : end + 3;
      next += body.slice(cursor, start);
      next += replacementFor(body.slice(start, stop));
      cursor = stop;
    }
    return next;
  });
}

function stripHashComments(text) {
  return stripWithBom(text, (body) =>
    body
      .split(/(\r?\n)/)
      .map((part, index) =>
        index % 2 === 0 ? stripHashCommentFromLine(part) : part
      )
      .join('')
  );
}

function stripYamlComments(text) {
  return stripWithBom(text, (body) => {
    const lines = body.split(/(\r?\n)/);
    let blockIndent;
    let next = '';
    for (let index = 0; index < lines.length; index += 2) {
      const line = lines[index];
      const newline = lines[index + 1] ?? '';
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (blockIndent !== undefined) {
        if (line.trim() !== '' && indent <= blockIndent) {
          blockIndent = undefined;
        } else {
          next += stripBlockScalarLine(line) + newline;
          continue;
        }
      }
      const stripped = stripHashCommentFromLine(line);
      next += stripped + newline;
      if (startsBlockScalar(stripped)) {
        blockIndent = indent;
      }
    }
    return next;
  });
}

function stripBlockScalarLine(line) {
  return line.trimStart().startsWith('#')
    ? line.slice(0, line.length - line.trimStart().length)
    : line;
}

function startsBlockScalar(line) {
  let quote;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote) {
      if (char === '\\' && quote === '"') {
        index++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (
      (char === '|' || char === '>') &&
      line
        .slice(index + 1)
        .trim()
        .match(/^[-+]?$/)
    ) {
      return true;
    }
  }
  return false;
}

function stripHashCommentFromLine(line) {
  let quote;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote) {
      if (char === '\\' && quote === '"') {
        index++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function stripComments(text, kind, filePath) {
  if (kind === 'js') {
    return stripJsLike(text, filePath);
  }
  if (kind === 'css') {
    return stripBlockComments(text);
  }
  if (kind === 'html') {
    return stripHtmlComments(text);
  }
  if (kind === 'yaml') {
    return stripYamlComments(text);
  }
  if (kind === 'hash') {
    return stripHashComments(text);
  }
  return text;
}

let checked = 0;
let changed = 0;
const changedFiles = [];

for (const filePath of listGitFiles()) {
  if (shouldSkip(filePath)) {
    continue;
  }
  const kind = getKind(filePath);
  if (!kind) {
    continue;
  }
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    continue;
  }
  const before = readFileSync(absolutePath, 'utf8');
  const after = stripComments(before, kind, filePath);
  checked++;
  if (after === before) {
    continue;
  }
  changed++;
  changedFiles.push(filePath);
  if (!isDryRun) {
    writeFileSync(absolutePath, after);
  }
}

if (isVerbose || changedFiles.length > 0) {
  for (const filePath of changedFiles) {
    process.stdout.write(
      `${isDryRun ? 'would update' : 'updated'} ${filePath}\n`
    );
  }
}

process.stdout.write(
  `${isDryRun ? 'Checked' : 'Updated'} ${checked} files; ${changed} ${changed === 1 ? 'file' : 'files'} ${isDryRun ? 'would change' : 'changed'}.\n`
);

if (isCheck && changed > 0) {
  process.exit(1);
}
