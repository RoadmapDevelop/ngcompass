import type { Program } from 'oxc-parser';
import type { ExtractedTemplate } from '../models/index.js';
import { walkProgram } from '../visitor.js';

type AstNode = {
  type?: string;
  [key: string]: unknown;
};

const EMPTY: ExtractedTemplate = { content: '', startOffset: 0 };

export function extractTemplateFromProgram(
  program: Program
): ExtractedTemplate {
  let result: ExtractedTemplate = EMPTY;

  walkProgram(program, (rawNode) => {
    const node = rawNode as AstNode;

    if (result.content) return false;

    if (node.type !== 'ClassDeclaration' || !Array.isArray(node.decorators))
      return;

    const extracted = tryExtractFromClass(node);
    if (extracted) {
      result = extracted;
      return false;
    }
  });

  return result;
}

function tryExtractFromClass(classNode: AstNode): ExtractedTemplate | null {
  const decorators = classNode.decorators as ReadonlyArray<AstNode> | undefined;
  if (!decorators) return null;

  for (const decorator of decorators) {
    const call = decorator?.expression as AstNode | undefined;
    if (!call || call.type !== 'CallExpression') continue;

    const callee = call.callee as AstNode | undefined;
    if (!callee || callee.type !== 'Identifier' || callee.name !== 'Component')
      continue;

    const args = call.arguments as ReadonlyArray<AstNode> | undefined;
    const objectArg = args?.[0];
    if (!objectArg || objectArg.type !== 'ObjectExpression') continue;

    const templateValue = findPropertyValue(
      objectArg.properties as ReadonlyArray<AstNode>,
      'template'
    );
    if (templateValue) return extractStringValueWithOffset(templateValue);
  }
  return null;
}

function findPropertyValue(
  properties: ReadonlyArray<AstNode>,
  keyName: string
): AstNode | null {
  if (!Array.isArray(properties)) return null;
  for (const prop of properties) {
    const key = prop?.key as AstNode | undefined;
    const value = prop?.value as AstNode | undefined;
    if (!key || !value) continue;
    const name = key.name ?? key.value;
    if (name === keyName) return value;
  }
  return null;
}

function extractStringValueWithOffset(node: AstNode): ExtractedTemplate {
  if (!node) return EMPTY;

  if (node.type === 'StringLiteral' || node.type === 'Literal') {
    const span = node.span as { start?: number } | undefined;
    const nodeStart = (node.start as number | undefined) ?? span?.start ?? 0;
    return {
      content: (node.value as string | undefined) ?? '',
      startOffset: nodeStart + 1,
    };
  }

  if (node.type === 'TemplateLiteral') {
    const quasis = (node.quasis as ReadonlyArray<AstNode> | undefined) ?? [];
    const content = quasis
      .map((q) => {
        const quasiValue = q.value as { raw?: string } | undefined;
        return quasiValue?.raw ?? '';
      })
      .join('');
    const firstSpan = quasis[0]?.span as { start?: number } | undefined;
    const firstStart =
      (quasis[0]?.start as number | undefined) ?? firstSpan?.start ?? 0;
    return {
      content,
      startOffset: firstStart + 1,
    };
  }

  return EMPTY;
}
