import Database from 'better-sqlite3';
import type { Database as DatabaseType, RunResult, Statement } from 'better-sqlite3';
import { DatabaseError } from '../../types/database.js';
import debug from 'debug';

const log = debug('mcp:workspace-manager:sqlite');

export interface SQLiteConfig {
  verbose?: boolean;
  timeout?: number;
  readonly?: boolean;
}

/**
 * SQLite database wrapper with async/await support and prepared statement caching
 */
export class SQLiteDatabase {
  private db: DatabaseType | null = null;
  private readonly filename: string;
  private readonly config: Required<SQLiteConfig>;
  private preparedStatements: Map<string, Statement> = new Map();

  constructor(filename: string, config: SQLiteConfig = {}) {
    this.filename = filename;
    this.config = {
      verbose: config.verbose ?? false,
      timeout: config.timeout ?? 5000,
      readonly: config.readonly ?? false,
    };
  }

  async connect(): Promise<void> {
    if (this.db !== null) return;

    try {
      this.db = new Database(this.filename, {
        verbose: this.config.verbose ? log : undefined,
        timeout: this.config.timeout,
        readonly: this.config.readonly,
        fileMustExist: this.config.readonly,
      });

      // Enable foreign keys and WAL mode for better performance
      this.db.pragma('foreign_keys = ON');
      if (!this.config.readonly) {
        this.db.pragma('journal_mode = WAL');
      }

      log('Connected to database:', this.filename);
    } catch (error) {
      throw new DatabaseError(
        `Failed to connect to database: ${(error as Error).message}`,
        'CONNECTION_ERROR',
        'connect'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.db === null) return;

    try {
      // Clear prepared statements cache
      this.preparedStatements.clear();

      // Close database connection
      this.db.close();
      this.db = null;
      log('Disconnected from database:', this.filename);
    } catch (error) {
      throw new DatabaseError(
        `Failed to disconnect from database: ${(error as Error).message}`,
        'DISCONNECT_ERROR',
        'disconnect'
      );
    }
  }

  async transaction<T>(callback: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    if (this.db === null) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', 'transaction');
    }

    try {
      this.db.exec('BEGIN TRANSACTION');
      const result = await callback(this);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw new DatabaseError(
        `Transaction failed: ${(error as Error).message}`,
        'TRANSACTION_ERROR',
        'transaction'
      );
    }
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.db === null) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', 'query');
    }

    try {
      let stmt = this.preparedStatements.get(sql);
      if (!stmt) {
        stmt = this.db.prepare(sql);
        this.preparedStatements.set(sql, stmt);
      }

      const result = stmt.all(params) as T[];
      log('Query executed:', { sql, params });
      return result;
    } catch (error) {
      throw new DatabaseError(
        `Query failed: ${(error as Error).message}`,
        'QUERY_ERROR',
        'query'
      );
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<RunResult> {
    if (this.db === null) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', 'execute');
    }

    try {
      let stmt = this.preparedStatements.get(sql);
      if (!stmt) {
        stmt = this.db.prepare(sql);
        this.preparedStatements.set(sql, stmt);
      }

      const result = stmt.run(params);
      log('Statement executed:', { sql, params });
      return result;
    } catch (error) {
      throw new DatabaseError(
        `Execute failed: ${(error as Error).message}`,
        'EXECUTE_ERROR',
        'execute'
      );
    }
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    if (this.db === null) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', 'get');
    }

    try {
      let stmt = this.preparedStatements.get(sql);
      if (!stmt) {
        stmt = this.db.prepare(sql);
        this.preparedStatements.set(sql, stmt);
      }

      const result = stmt.get(params) as T | undefined;
      log('Get executed:', { sql, params });
      return result;
    } catch (error) {
      throw new DatabaseError(
        `Get failed: ${(error as Error).message}`,
        'GET_ERROR',
        'get'
      );
    }
  }

  async exists(sql: string, params: unknown[] = []): Promise<boolean> {
    const result = await this.get(sql, params);
    return result !== undefined;
  }

  async exec(sql: string): Promise<void> {
    if (this.db === null) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', 'exec');
    }

    try {
      this.db.exec(sql);
      log('SQL executed:', sql);
    } catch (error) {
      throw new DatabaseError(
        `Exec failed: ${(error as Error).message}`,
        'EXEC_ERROR',
        'exec'
      );
    }
  }

  getDatabasePath(): string {
    return this.filename;
  }

  isConnected(): boolean {
    return this.db !== null;
  }
}