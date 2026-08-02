import {
  type AstNodeLike,
  MEMBER_TYPES,
  isNode,
  keyName,
  spanOffset,
  walkWithParent,
} from '../shared/ast-functions.js';
import { type MemberSpan, ownerOfOffset } from './ts-members.js';

export interface DependencyRef {
  readonly typeName: string;
  readonly memberName: string;
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly weight: number;
}

interface DependencyAccumulator {
  readonly typeName: string;
  readonly memberName: string;
  readonly ownerName: string;
  readonly ownerLine: number;
  weight: number;
}

function injectedPropertyName(
  object: unknown,
  byProperty: ReadonlyMap<string, string>
): string | undefined {
  if (!isNode(object) || !MEMBER_TYPES.has(object.type)) return undefined;
  if (!isNode(object.object) || object.object.type !== 'ThisExpression') {
    return undefined;
  }
  const propertyName = keyName(object.property);
  return byProperty.has(propertyName) ? propertyName : undefined;
}

export function collectDependencyRefs(
  program: AstNodeLike,
  members: readonly MemberSpan[],
  byProperty: ReadonlyMap<string, string>
): readonly DependencyRef[] {
  if (byProperty.size === 0) return [];

  const tally = new Map<string, DependencyAccumulator>();

  walkWithParent(program, undefined, (node) => {
    if (!MEMBER_TYPES.has(node.type)) return;
    if (node.computed === true) return;

    const propertyName = injectedPropertyName(node.object, byProperty);
    if (!propertyName) return;

    const typeName = byProperty.get(propertyName);
    if (!typeName) return;

    const offset = spanOffset(node, 'start');
    const owner = ownerOfOffset(members, offset);
    if (!owner) return;

    const memberName = keyName(node.property);
    const key = `${typeName}.${memberName}|${owner.name}@${owner.line}`;
    const existing = tally.get(key);
    if (existing) {
      existing.weight++;
      return;
    }
    tally.set(key, {
      typeName,
      memberName,
      ownerName: owner.name,
      ownerLine: owner.line,
      weight: 1,
    });
  });

  return Array.from(tally.values());
}
