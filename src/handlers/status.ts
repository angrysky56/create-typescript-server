import type { HandlerContext } from './index.js';
import type { MCPRequest, MCPResponse } from '../types/server.js';

export async function handleStatus(
  _request: MCPRequest,
  context: HandlerContext
): Promise<MCPResponse> {
  const state = context.server.getState();
  
  return {
    success: true,
    data: {
      serverId: context.server.getServerId(),
      status: state.status,
      uptime: context.server.getUptime(),
      databaseCount: state.databaseCount,
      watchedPaths: state.watchedPaths,
      lastEvent: state.lastEvent
        ? {
            type: state.lastEvent.type,
            timestamp: new Date().toISOString(),
            details: state.lastEvent
          }
        : undefined
    }
  };
}