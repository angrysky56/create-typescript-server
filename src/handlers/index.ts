import type { WorkspaceManager } from '../index.js';
import type { MCPRequest, MCPResponse } from '../types/server.js';

export interface HandlerContext {
  server: WorkspaceManager;
}

export type HandlerFunction = (
  request: MCPRequest,
  context: HandlerContext
) => Promise<MCPResponse>;

// Import all handlers
import { handleStatus } from './status.js';
import {
  handleListDatabases,
  handleDatabaseInfo,
  handleAttachDatabase,
  handleDetachDatabase
} from './databases.js';
import {
  handleUpdatePaths,
  handleListPaths
} from './paths.js';

// Map message types to handlers
export const handlers = new Map<string, HandlerFunction>([
  // Status handlers
  ['status', handleStatus],
  
  // Database handlers
  ['list_databases', handleListDatabases],
  ['database_info', handleDatabaseInfo],
  ['attach_database', handleAttachDatabase],
  ['detach_database', handleDetachDatabase],
  
  // Path handlers
  ['list_paths', handleListPaths],
  ['update_paths', handleUpdatePaths]
]);