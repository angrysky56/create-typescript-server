import { EventEmitter } from 'events';
import { SQLiteDatabase, type SQLiteConfig } from './sqlite.js';
import { DatabaseError, type DatabaseRecord, type SystemConfig, type TableInfo } from '../../types/database.js';
import { basename } from 'path';
import debug from 'debug';

const log = debug('mcp:workspace-manager:database');

export interface DatabaseManagerConfig {
  corePath?: string;
  sqlite?: SQLiteConfig;
  serverId?: string;
}

export class DatabaseManager extends EventEmitter {
  private readonly coreDb: SQLiteDatabase;
  private readonly config: Required<DatabaseManagerConfig>;
  private readonly managedDatabases: Map<string, SQLiteDatabase> = new Map();
  private initialized = false;

  constructor(config: DatabaseManagerConfig = {}) {
    super();
    this.config = {
      corePath: config.corePath ?? 'core.db',
      sqlite: config.sqlite ?? {},
      serverId: config.serverId ?? 'unknown',
    };

    this.coreDb = new SQLiteDatabase(this.config.corePath, this.config.sqlite);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      log('Initializing database manager...');
      await this.coreDb.connect();
      await this.initializeTables();
      await this.initializeSystemConfig();
      this.initialized = true;
      log('Database manager initialized');
    } catch (error) {
      throw new DatabaseError(
        `Failed to initialize database manager: ${(error as Error).message}`,
        'INIT_ERROR',
        'initialize'
      );
    }
  }

  private async initializeTables(): Promise<void> {
    await this.coreDb.exec(`
      -- System configuration table
      CREATE TABLE IF NOT EXISTS system_config (
        config_key TEXT PRIMARY KEY,
        config_value TEXT NOT NULL,
        last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Managed databases table
      CREATE TABLE IF NOT EXISTS managed_databases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        size INTEGER,
        last_modified DATETIME,
        status TEXT CHECK (status IN ('active', 'inactive', 'error', 'removed')) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_databases_path ON managed_databases(path);
      CREATE INDEX IF NOT EXISTS idx_databases_status ON managed_databases(status);
    `);
  }

  private async initializeSystemConfig(): Promise<void> {
    const configs = [
      {
        key: 'server_id',
        value: this.config.serverId,
      },
      {
        key: 'initialization_status',
        value: JSON.stringify({ status: 'completed', version: '1.0' }),
      },
      {
        key: 'schema_version',
        value: JSON.stringify({ version: '1.0' }),
      },
    ];

    for (const config of configs) {
      await this.coreDb.execute(
        `INSERT OR REPLACE INTO system_config (config_key, config_value, last_modified) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [config.key, config.value]
      );
    }
  }

  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    return this.coreDb.get<SystemConfig>(
      'SELECT * FROM system_config WHERE config_key = ?',
      [key]
    );
  }

  async setSystemConfig(key: string, value: unknown): Promise<void> {
    await this.coreDb.execute(
      `INSERT OR REPLACE INTO system_config (config_key, config_value, last_modified) 
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [key, JSON.stringify(value)]
    );
  }

  async addManagedDatabase(path: string, size?: number): Promise<DatabaseRecord> {
    try {
      // Add to managed_databases table
      await this.coreDb.execute(
        `INSERT INTO managed_databases (path, name, size, last_modified)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [path, basename(path), size]
      );

      // Get the created record
      const record = await this.coreDb.get<DatabaseRecord>(
        'SELECT * FROM managed_databases WHERE path = ?',
        [path]
      );

      if (!record) {
        throw new DatabaseError(
          'Failed to retrieve newly created database record',
          'DATABASE_NOT_FOUND',
          'addManagedDatabase'
        );
      }

      // Try to connect to the database
      const db = new SQLiteDatabase(path, { readonly: true });
      await db.connect();
      this.managedDatabases.set(path, db);

      this.emit('database-added', record);
      return record;
    } catch (error) {
      throw new DatabaseError(
        `Failed to add managed database: ${(error as Error).message}`,
        'ADD_DATABASE_ERROR',
        'addManagedDatabase'
      );
    }
  }

  async updateManagedDatabase(path: string, updates: Partial<DatabaseRecord>): Promise<void> {
    const setClause = Object.entries(updates)
      .map(([key]) => `${key} = ?`)
      .join(', ');

    const values = Object.values(updates);
    values.push(path);

    await this.coreDb.execute(
      `UPDATE managed_databases 
       SET ${setClause}, last_modified = CURRENT_TIMESTAMP 
       WHERE path = ?`,
      values
    );

    const record = await this.getManagedDatabase(path);
    if (record) {
      this.emit('database-changed', record);
    }
  }

  async removeManagedDatabase(path: string): Promise<void> {
    await this.coreDb.execute(
      `UPDATE managed_databases 
       SET status = 'removed', last_modified = CURRENT_TIMESTAMP 
       WHERE path = ?`,
      [path]
    );

    // Close and remove from managed databases if it exists
    const db = this.managedDatabases.get(path);
    if (db) {
      await db.disconnect();
      this.managedDatabases.delete(path);
    }

    this.emit('database-removed', path);
  }

  async getManagedDatabase(path: string): Promise<DatabaseRecord | undefined> {
    return this.coreDb.get<DatabaseRecord>(
      'SELECT * FROM managed_databases WHERE path = ?',
      [path]
    );
  }

  async listManagedDatabases(): Promise<DatabaseRecord[]> {
    return this.coreDb.query<DatabaseRecord>(
      'SELECT * FROM managed_databases WHERE status != ? ORDER BY last_modified DESC',
      ['removed']
    );
  }

  async getDatabaseInfo(path: string): Promise<TableInfo[]> {
    const db = this.managedDatabases.get(path);
    if (!db) {
      throw new DatabaseError(
        'Database not found or not loaded',
        'DATABASE_NOT_FOUND',
        'getDatabaseInfo'
      );
    }

    return db.query<TableInfo>(`
      SELECT 
        name,
        sql,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='table') as rowCount
      FROM sqlite_master 
      WHERE type='table'
      ORDER BY name
    `);
  }

  async cleanup(): Promise<void> {
    // Close all managed databases
    for (const [path, db] of this.managedDatabases) {
      try {
        await db.disconnect();
      } catch (error) {
        log(`Failed to close database ${path}:`, error);
      }
    }
    this.managedDatabases.clear();

    // Close core database
    await this.coreDb.disconnect();
    this.initialized = false;
    this.emit('cleanup');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
