export interface PluginManifest {
  readonly name: string;

  readonly version: string;

  readonly apiVersion: string;

  readonly engineVersionRange: string;

  readonly capabilities?: {
    readonly requiresTypeInfo?: boolean;

    readonly requiresTemplateAST?: boolean;

    readonly requiresCssAST?: boolean;
  };
}
