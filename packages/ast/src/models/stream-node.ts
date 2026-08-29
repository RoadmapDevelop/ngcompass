import type { ClassDeclaration, PropertyDefinition } from './class-node.js';
import type { ComponentMetadata } from './component-metadata.js';
import type { Decorator } from './ts-node.js';

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
