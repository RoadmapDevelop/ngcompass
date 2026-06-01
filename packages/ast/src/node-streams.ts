import {
  analyzeComponent,
  type ComponentMetadata,
} from './analyzers/component-analyzer.js';
import { getDecoratorNameUnsafe } from './ast/matchers.js';
import { nodeStart } from './ast/types.js';
import type {
  CallExpression,
  ClassDeclaration,
  Decorator,
  Expression,
  ImportDeclaration,
  NewExpression,
  PropertyDefinition,
} from './ast/types.js';

export interface TemplateExpressionNode {
  readonly expression: Expression;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateAttributeNode {
  readonly name: string;
  readonly value?: string;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateBlockNode {
  readonly name: string;
  readonly parameters: ReadonlyArray<{
    readonly expression: string;
    readonly sourceSpan: { start: number; end: number };
  }>;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateAnalysis {
  readonly expressions: ReadonlyArray<TemplateExpressionNode>;
  readonly attributes: ReadonlyArray<TemplateAttributeNode>;
  readonly blocks: ReadonlyArray<TemplateBlockNode>;
}

export interface AngularClassNode {
  readonly node: ClassDeclaration;
  readonly metadata: ComponentMetadata;
}

export interface AnyAngularClassNode {
  readonly node: ClassDeclaration;
  readonly decoratorName: string;
  readonly className: string | undefined;
  readonly decoratorStart: number;
}

export interface DecoratedPropertyNode {
  readonly node: PropertyDefinition;
  readonly decorators: ReadonlyArray<Decorator>;
}

export const toAngularClassStream = (
  classNode: ClassDeclaration
): AngularClassNode | null => {
  const metadata = analyzeComponent(classNode);
  if (!metadata) return null;
  return { node: classNode, metadata };
};

const ANY_ANGULAR_DECORATORS = new Set([
  'Component',
  'Directive',
  'Pipe',
  'Injectable',
  'NgModule',
]);

export const toAnyAngularClassStream = (
  classNode: ClassDeclaration
): AnyAngularClassNode | null => {
  const decorators = classNode.decorators;
  if (!decorators) return null;
  for (let i = 0; i < decorators.length; i++) {
    const decorator = decorators[i];
    const name = getDecoratorNameUnsafe(decorator);
    if (name && ANY_ANGULAR_DECORATORS.has(name)) {
      return {
        node: classNode,
        decoratorName: name,
        className: classNode.id?.name,
        decoratorStart: nodeStart(decorator),
      };
    }
  }
  return null;
};

export const toDecoratedPropertyStream = (
  propertyNode: PropertyDefinition
): DecoratedPropertyNode | null => {
  const decorators = propertyNode.decorators;
  if (!decorators || decorators.length === 0) return null;
  return { node: propertyNode, decorators };
};

export const toCallExpressionStream = (node: CallExpression): CallExpression =>
  node;

export const toNewExpressionStream = (node: NewExpression): NewExpression =>
  node;

export const toImportDeclarationStream = (
  node: ImportDeclaration
): ImportDeclaration => node;
