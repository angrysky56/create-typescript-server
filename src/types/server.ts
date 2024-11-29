import { z } from 'zod';

// Server configuration schema
export const ServerConfigSchema = z.object({
  serverId: z.string().optional(),
  watchPaths: z.array(z.string()),
  database: z.object({
    path: z.string().default('core.db'),
    verbose: z.boolean().default(false),
  }).default({}),
  monitor: z.object({
    patterns: z.array(z.string()).default(['**/*.db', '**/*.sqlite', '**/*.sqlite3']),
    pollInterval: z.number().default(1000),
    usePolling: z.boolean().default(true),
    ignored: z.array(z.string()).default([
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/*.db-journal',
      '**/*.db-wal',
      '**/*.db-shm'
    ]),
  }).default({}),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// Server event types
export type ServerEvent =
  | { type: 'server:start' }
  | { type: 'server:stop' }
  | { type: 'database:added'; path: string }
  | { type: 'database:changed'; path: string }
  | { type: 'database:removed'; path: string }
  | { type: 'error'; error: Error };

// Server state types
export type ServerState = {
  status: 'initializing' | 'running' | 'stopped' | 'error';
  databaseCount: number;
  watchedPaths: string[];
  lastEvent?: ServerEvent;
  error?: Error;
};

// MCP message types
export type MCPRequest = {
  type: string;
  data?: unknown;
};

export type MCPResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

// MCP tool types
export type ListDatabasesResponse = {
  databases: Array<{
    path: string;
    name: string;
    size?: number;
    status: string;
    lastModified?: string;
  }>;
};

export type DatabaseInfoResponse = {
  path: string;
  name: string;
  size?: number;
  status: string;
  lastModified?: string;
  tables?: Array<{
    name: string;
    rowCount: number;
  }>;
};

export type ServerStatusResponse = {
  serverId: string;
  status: string;
  uptime: number;
  databaseCount: number;
  watchedPaths: string[];
  lastEvent?: {
    type: string;
    timestamp: string;
    details?: unknown;
  };
};