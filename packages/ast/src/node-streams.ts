import { analyzeComponent } from './analyzers/component-analyzer.js';
import { getDecoratorNameUnsafe } from './ast/matchers.js';
import { nodeStart } from './ast/node-offsets.js';
import type {
  AngularClassNode,
  AnyAngularClassNode,
  CallExpression,
  ClassDeclaration,
  DecoratedPropertyNode,
  ImportDeclaration,
  NewExpression,
  PropertyDefinition,
} from './models/index.js';

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
