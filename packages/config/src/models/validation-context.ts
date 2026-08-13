export interface ValidationContext {
  profile?: string;

  cwd: string;
  fs: {
    existsSync: (path: string) => boolean;
    accessSync: (path: string, mode: number) => void;
  };
  os: {
    cpus: () => Array<{ model: string }>;
  };
  path: {
    dirname: (p: string) => string;
    resolve: (...paths: string[]) => string;
    isAbsolute: (p: string) => boolean;
  };
}
