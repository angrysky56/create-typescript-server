import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import debug from 'debug';
import {
  ServerConfig,
  ServerConfigSchema,
  ServerEvent,
  ServerState,
  MCPRequest,
  MCPResponse
} from './types/server.js';
import { DatabaseManager } from './core/database/manager.js';
import { FileSystemWatcher } from './core/monitor/watcher.js';
import { handlers, type HandlerContext } from './handlers/index.js';
import type { DatabaseEvent } from './types/database.js';

const log = debug('mcp:workspace-manager');

export class WorkspaceManager extends EventEmitter {
  private readonly config: ServerConfig;
  private state: ServerState;
  private startTime?: Date;
  private dbManager: DatabaseManager;
  private fileWatcher: FileSystemWatcher;

  constructor(config: Partial<ServerConfig>) {
    super();
    
    // Validate and process configuration
    const validatedConfig = ServerConfigSchema.parse({
      serverId: config.serverId ?? `workspace-manager-${randomUUID()}`,
      ...config
    });

    this.config = validatedConfig;
    this.state = {
      status: 'initializing',
      databaseCount: 0,
      watchedPaths: this.config.watchPaths
    };

    // Initialize core components
    this.dbManager = new DatabaseManager({
      corePath: this.config.database?.path,
      sqlite: {
        verbose: this.config.database?.verbose
      },
      serverId: this.config.serverId
    });

    this.fileWatcher = new FileSystemWatcher({
      paths: this.config.watchPaths,
      ...this.config.monitor,
      serverId: this.config.serverId
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Database manager events
    this.dbManager.on('database-added', (database) => {
      this.state.databaseCount++;
      const event: ServerEvent = { type: 'database:added', path: database.path };
      this.state.lastEvent = event;
      this.emit('event', event);
    });

    this.dbManager.on('database-changed', (database) => {
      const event: ServerEvent = { type: 'database:changed', path: database.path };
      this.state.lastEvent = event;
      this.emit('event', event);
    });

    this.dbManager.on('database-removed', (path) => {
      this.state.databaseCount--;
      const event: ServerEvent = { type: 'database:removed', path };
      this.state.lastEvent = event;
      this.emit('event', event);
    });

    // File watcher events
    this.fileWatcher.on('database-event', async (event: DatabaseEvent) => {
      try {
        switch (event.type) {
          case 'add':
            await this.dbManager.addManagedDatabase(event.path, event.size);
            break;
          case 'change':
            await this.dbManager.updateManagedDatabase(event.path, { size: event.size });
            break;
          case 'unlink':
            await this.dbManager.removeManagedDatabase(event.path);
            break;
        }
      } catch (error) {
        log('Error handling database event:', error);
        this.emit('error', error as Error);
      }
    });

    // Error handling
    this.on('error', (error: Error) => {
      log('Server error:', error);
      this.state = {
        ...this.state,
        status: 'error',
        error
      };
    });
  }

  async start(): Promise<void> {
    try {
      log('Starting workspace manager server...');
      
      // Initialize core components
      await this.initializeComponents();
      
      // Update server state
      this.startTime = new Date();
      this.state = {
        ...this.state,
        status: 'running'
      };
      
      this.emit({ type: 'server:start' } as ServerEvent);
      log('Server started successfully');
    } catch (error) {
      log('Failed to start server:', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async initializeComponents(): Promise<void> {
    // Initialize database manager
    await this.dbManager.initialize();
    
    // Get initial database count
    const databases = await this.dbManager.listManagedDatabases();
    this.state.databaseCount = databases.length;

    // Start file system monitoring
    await this.fileWatcher.start();
  }

  async stop(): Promise<void> {
    try {
      log('Stopping workspace manager server...');
      
      // Stop components
      await this.fileWatcher.stop();
      await this.dbManager.cleanup();
      
      this.state = {
        ...this.state,
        status: 'stopped'
      };
      
      this.emit({ type: 'server:stop' } as ServerEvent);
      log('Server stopped successfully');
    } catch (error) {
      log('Error stopping server:', error);
      throw error;
    }
  }

  // Handle incoming MCP messages
  async handleMessage(message: MCPRequest): Promise<MCPResponse> {
    const startTime = Date.now();
    log('Handling message:', message.type);

    try {
      const handler = handlers.get(message.type);
      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }

      const context: HandlerContext = { server: this };
      const response = await handler(message, context);

      const duration = Date.now() - startTime;
      log('Message handled successfully:', { type: message.type, duration });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      log('Error handling message:', { type: message.type, duration, error });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  // Public getters
  getServerId(): string {
    return this.config.serverId;
  }

  getState(): ServerState {
    return this.state;
  }

  getUptime(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  getFileWatcher(): FileSystemWatcher {
    return this.fileWatcher;
  }
}

export default WorkspaceManager;
