import type { HandlerContext } from './index.js';
import type { MCPRequest, MCPResponse } from '../types/server.js';
import { z } from 'zod';

// Request validation schemas
const UpdatePathsRequestSchema = z.object({
  paths: z.array(z.string()),
  operation: z.enum(['set', 'add', 'remove']).default('set')
});

export async function handleUpdatePaths(
  request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    // Validate request
    const { paths, operation } = UpdatePathsRequestSchema.parse(request.data);
    
    switch (operation) {
      case 'set':
        // Replace all paths
        await context.server.getFileWatcher().reloadPaths(paths);
        break;
        
      case 'add':
        // Add new paths
        for (const path of paths) {
          await context.server.getFileWatcher().addPath(path);
        }
        break;
        
      case 'remove':
        // Remove specified paths
        for (const path of paths) {
          await context.server.getFileWatcher().removePath(path);
        }
        break;
    }
    
    // Get updated paths
    const currentPaths = context.server.getFileWatcher().getWatchedPaths();
    
    return {
      success: true,
      data: {
        operation,
        paths: currentPaths,
        message: `Successfully ${operation}ed paths`
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
      error: `Failed to update paths: ${(error as Error).message}`
    };
  }
}

export async function handleListPaths(
  _request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  try {
    const paths = context.server.getFileWatcher().getWatchedPaths();
    
    return {
      success: true,
      data: {
        paths
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list paths: ${(error as Error).message}`
    };
  }
}