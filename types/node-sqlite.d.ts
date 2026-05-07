declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(location: string);
    close(): void;
    exec(sql: string): this;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    all(...anonymousParameters: unknown[]): unknown[];
    get(...anonymousParameters: unknown[]): unknown;
    run(...anonymousParameters: unknown[]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }

  export function backup(...args: unknown[]): Promise<void>;

  const sqlite: {
    DatabaseSync: typeof DatabaseSync;
    StatementSync: typeof StatementSync;
    backup: typeof backup;
    constants: Record<string, unknown>;
  };

  export default sqlite;
}
