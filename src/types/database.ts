import { z } from 'zod';

// Database schemas and validation
export const DatabaseRecordSchema = z.object({
  id: z.number(),
  path: z.string(),
  name: z.string(),
  size: z.number().optional(),
  lastModified: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error', 'removed']),
  createdAt: z.string(),
  lastChecked: z.string()
});

export const SystemConfigSchema = z.object({
  configKey: z.string(),
  configValue: z.string(),
  lastModified: z.string()
});

export const TableInfoSchema = z.object({
  name: z.string(),
  sql: z.string().optional(),
  rowCount: z.number().optional(),
  size: z.number().optional()
});

// Event types
export type DatabaseEvent = {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
  size?: number;
};

// Type aliases
export type DatabaseRecord = z.infer<typeof DatabaseRecordSchema>;
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type TableInfo = z.infer<typeof TableInfoSchema>;

// Error types
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}