export interface ChildCompilationResultEntry {
  hash: string;
  entry: any;
  content: string;
}

export type ChildCompilationResult =
  | {
      dependencies: FileDependencies;
      compiledEntries: {
        [entryName: string]: ChildCompilationResultEntry;
      };
    }
  | {
      dependencies: FileDependencies;
      error: Error;
    };

export interface FileDependencies {
  fileDependencies: string[];
  contextDependencies: string[];
  missingDependencies: string[];
}

export type PersistentChildCompilation =
  | {
      isCompiling: false;
      isVerifyingCache: false;
      entries: string[];
      compiledEntries: string[];
      mainCompilationHash: string;
      compilationResult: ChildCompilationResult;
    }
  | Readonly<{
      isCompiling: false;
      isVerifyingCache: true;
      entries: string[];
      previousEntries: string[];
      previousResult: ChildCompilationResult;
    }>
  | Readonly<{
      isVerifyingCache: false;
      isCompiling: true;
      entries: string[];
    }>;
