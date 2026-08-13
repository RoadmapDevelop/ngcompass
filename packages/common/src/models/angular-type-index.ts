export interface AngularTypeIndex {
  isFromPackage(
    symbol: import('typescript').Symbol | undefined,
    packageName: string
  ): boolean;

  isFromAngularCore(symbol: import('typescript').Symbol | undefined): boolean;

  isSignal(type: import('typescript').Type | undefined): boolean;

  isWritableSignal(type: import('typescript').Type | undefined): boolean;

  isObservable(type: import('typescript').Type | undefined): boolean;

  isSubjectLike(type: import('typescript').Type | undefined): boolean;

  isHttpClient(type: import('typescript').Type | undefined): boolean;

  isInjectionToken(type: import('typescript').Type | undefined): boolean;

  isEventEmitter(type: import('typescript').Type | undefined): boolean;

  isChangeDetectorRef(type: import('typescript').Type | undefined): boolean;

  isInjectableClass(symbol: import('typescript').Symbol | undefined): boolean;
}
