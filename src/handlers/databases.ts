import type { HandlerContext } from './index.js';
import type { MCPRequest, MCPResponse } from '../types/server.js';
import { z } from 'zod';

// Request validation schemas
const DatabaseInfoRequestSchema = z.object({
  path: z.string()
});

export async function handleListDatabases(
  _request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    const databases = await context.server.getDatabaseManager().listManagedDatabases();
    
    return {
      success: true,
      data: {
        databases: databases.map(db => ({
          path: db.path,
          name: db.name,
          size: db.size,
          status: db.status,
          lastModified: db.last_modified
        }))
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list databases: ${(error as Error).message}`
    };
  }
}

export async function handleDatabaseInfo(
  request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    // Validate request
    const { path } = DatabaseInfoRequestSchema.parse(request.data);
    
    // Get base database info
    const database = await context.server.getDatabaseManager().getManagedDatabase(path);
    if (!database) {
      return {
        success: false,
        error: `Database not found: ${path}`
      };
    }

    // Get detailed table information
    const tables = await context.server.getDatabaseManager().getDatabaseInfo(path);

    return {
      success: true,
      data: {
        path: database.path,
        name: database.name,
        size: database.size,
        status: database.status,
        lastModified: database.last_modified,
        tables: tables.map(table => ({
          name: table.name,
          rowCount: table.rowCount ?? 0
        }))
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid request parameters: ' + error.errors.map(e => e.message).join(', ')
      };
    }

    return {
      success: false,
      error: `Failed to get database info: ${(error as Error).message}`
    };
  }
}

export async function handleAttachDatabase(
  request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    const { path } = DatabaseInfoRequestSchema.parse(request.data);
    
    const database = await context.server.getDatabaseManager().addManagedDatabase(path);
    
    return {
      success: true,
      data: {
        path: database.path,
        name: database.name,
        size: database.size,
        status: database.status,
        lastModified: database.last_modified
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid request parameters: ' + error.errors.map(e => e.message).join(', ')
      };
    }

    return {
      success: false,
      error: `Failed to attach database: ${(error as Error).message}`
    };
  }
}

export async function handleDetachDatabase(
  request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    const { path } = DatabaseInfoRequestSchema.parse(request.data);
    
    await context.server.getDatabaseManager().removeManagedDatabase(path);
    
    return {
      success: true,
      data: {
        message: `Database ${path} successfully detached`
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid request parameters: ' + error.errors.map(e => e.message).join(', ')
      };
    }

    return {
      success: false,
      error: `Failed to detach database: ${(error as Error).message}`
    };
  }
}