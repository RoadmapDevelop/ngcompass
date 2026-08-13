export type LiteralValue<T> = { readonly kind: 'literal'; readonly value: T };
export type NonLiteralValue = { readonly kind: 'non-literal' };
export type MissingValue = { readonly kind: 'missing' };

export type MetadataValue<T> = LiteralValue<T> | NonLiteralValue | MissingValue;
