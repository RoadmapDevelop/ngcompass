import type { BoxKind } from '@ngcompass/common';

export interface MemberSpan {
  readonly name: string;
  readonly kind: BoxKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly start: number;
  readonly end: number;
}

export interface InjectedDependency {
  readonly propertyName: string;
  readonly typeName: string;
}

export interface EntryClassInfo {
  readonly className: string | null;
  readonly members: readonly MemberSpan[];
  readonly injected: readonly InjectedDependency[];
}
