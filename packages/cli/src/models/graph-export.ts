export interface GraphExportPayload {
  readonly graph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly cycles?: ReadonlyArray<ReadonlyArray<string>>;
  readonly rootDir: string;
  readonly focus: string | undefined;
  readonly depth: number;
  readonly fileCount: number;
  readonly generatedAt: Date;
}
