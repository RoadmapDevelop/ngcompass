export type RespawnOutcome =
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'crash'; readonly code: number }
  | { readonly kind: 'fallback' };
