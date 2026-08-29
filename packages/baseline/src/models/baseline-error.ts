export type BaselineError =
  | { readonly kind: 'BaselineNotFound'; readonly path: string }
  | {
      readonly kind: 'BaselineUnreadable';
      readonly path: string;
      readonly cause: string;
    }
  | {
      readonly kind: 'BaselineMalformed';
      readonly path: string;
      readonly detail: string;
    }
  | {
      readonly kind: 'BaselineVersionUnsupported';
      readonly path: string;
      readonly found: number;
      readonly supported: number;
    }
  | {
      readonly kind: 'BaselineWriteFailed';
      readonly path: string;
      readonly cause: string;
    };
