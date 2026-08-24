import {
  TemplateAttributeNode,
  TemplateBlockNode,
  TemplateAnalysis,
} from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import { getTemplateAbsoluteOffset } from '../../rule-utils';

const RULE_NAME = 'template-trackby-required';

const NGFOR_MESSAGE =
  '*ngFor without trackBy can recreate DOM nodes unnecessarily when list items change.';
const ATFOR_MESSAGE =
  '@for without a track expression can recreate DOM nodes unnecessarily when list items change.';

function createFailure(
  context: RuleContext,
  node: TemplateAttributeNode | TemplateBlockNode,
  message: string
): RuleFailure {
  const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
  const { line, column } = context.locator.location(offset);

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message,
    line,
    column,
    severity: 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
    codeExample: CODE_EXAMPLES[RULE_NAME],
  };
}

function hasNonEmptyTrackBy(microsyntax: string): boolean {
  const match = microsyntax.match(/\btrackBy\s*:\s*([^;]+?)\s*(?:;|$)/);
  return !!match?.[1]?.trim();
}

function hasNonEmptyForTrack(node: TemplateBlockNode): boolean {
  return node.parameters.some((param) => {
    const expression = param.expression?.trim() ?? '';
    if (!expression || !/^track\b/.test(expression)) {
      return false;
    }
    return expression.replace(/^track\b/, '').trim().length > 0;
  });
}

export const templateTrackByRequiredRule = createTemplateRule(
  RULE_NAME,
  (analysis: TemplateAnalysis, context: RuleContext): RuleFailure[] | null => {
    const failures: RuleFailure[] = [];

    for (const node of analysis.attributes) {
      if (node.name === '*ngFor' && !hasNonEmptyTrackBy(node.value ?? '')) {
        failures.push(createFailure(context, node, NGFOR_MESSAGE));
      }
    }

    for (const node of analysis.blocks) {
      if (node.name === 'for' && !hasNonEmptyForTrack(node)) {
        failures.push(createFailure(context, node, ATFOR_MESSAGE));
      }
    }

    return failures.length > 0 ? failures : null;
  },
  {
    requires: { htmlAst: true },
  }
);
