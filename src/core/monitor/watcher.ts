import { EventEmitter } from 'events';
import { watch } from 'chokidar';
import { basename, extname, join } from 'path';
import { statSync } from 'fs';
import debug from 'debug';
import type { DatabaseEvent } from '../../types/database.js';

const log = debug('mcp:workspace-manager:monitor');

export interface FileSystemWatcherConfig {
  paths: string[];
  patterns?: string[];
  ignored?: string[];
  pollInterval?: number;
  usePolling?: boolean;
  persistent?: boolean;
  serverId?: string;
}

export class FileSystemWatcher extends EventEmitter {
  private watcher: ReturnType<typeof watch> | null = null;
  private readonly config: Required<FileSystemWatcherConfig>;
  private isActive = false;

  constructor(config: FileSystemWatcherConfig) {
    super();
    this.config = {
      paths: config.paths,
      patterns: config.patterns ?? ['**/*.db', '**/*.sqlite', '**/*.sqlite3'],
      ignored: config.ignored ?? [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/*.db-journal',
        '**/*.db-wal',
        '**/*.db-shm'
      ],
      pollInterval: config.pollInterval ?? 1000,
      usePolling: config.usePolling ?? true,
      persistent: config.persistent ?? true,
      serverId: config.serverId ?? 'unknown'
    };
  }

  async start(): Promise<void> {
    if (this.isActive) {
      log('Watcher is already running');
      return;
    }

    try {
      log('Starting file system watcher with config:', {
        ...this.config,
        paths: this.config.paths.length
      });

      // Create watch patterns for each path
      const watchPatterns = this.config.paths.map(path => 
        this.config.patterns.map(pattern => join(path, pattern))
      ).flat();

      this.watcher = watch(watchPatterns, {
        ignored: this.config.ignored,
        persistent: this.config.persistent,
        ignoreInitial: false,
        usePolling: this.config.usePolling,
        interval: this.config.pollInterval,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        },
        atomic: true // For handling atomic writes (e.g., SQLite journal files)
      });

      this.setupEventHandlers();
      this.isActive = true;
      
      log('File system watcher started');
      this.emit('started', {
        serverId: this.config.serverId,
        paths: this.config.paths
      });

    } catch (error) {
      const err = error as Error;
      log('Failed to start watcher:', err);
      this.emit('error', err);
      throw err;
    }
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher
      .on('add', (path) => this.handleFileEvent('add', path))
      .on('change', (path) => this.handleFileEvent('change', path))
      .on('unlink', (path) => this.handleFileEvent('unlink', path))
      .on('error', (error) => {
        log('Watcher error:', error);
        this.emit('error', error);
      });

    // Ready event indicates initial scan is complete
    this.watcher.on('ready', () => {
      log('Initial scan complete');
      this.emit('ready', {
        serverId: this.config.serverId,
        paths: this.config.paths
      });
    });
  }

  private async handleFileEvent(type: DatabaseEvent['type'], path: string): Promise<void> {
    try {
      const event: DatabaseEvent = {
        type,
        path,
        timestamp: new Date(),
        extension: extname(path)
      };

      // Add file size for add/change events
      if (type !== 'unlink') {
        try {
          const stats = statSync(path);
          event.size = stats.size;
        } catch (error) {
          log('Failed to get file stats:', error);
        }
      }

      log('File event:', event);

      // Emit both specific and generic events
      this.emit('database-event', event);
      this.emit(`database-${type}`, event);

    } catch (error) {
      log('Error handling file event:', error);
      this.emit('error', error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive || !this.watcher) {
      log('Watcher is not running');
      return;
    }

    try {
      await this.watcher.close();
      this.watcher = null;
      this.isActive = false;
      
      log('File system watcher stopped');
      this.emit('stopped', {
        serverId: this.config.serverId,
        timestamp: new Date()
      });
    } catch (error) {
      const err = error as Error;
      log('Failed to stop watcher:', err);
      this.emit('error', err);
      throw err;
    }
  }

  getWatchedPaths(): string[] {
    return this.config.paths;
  }

  isRunning(): boolean {
    return this.isActive;
  }

  async reloadPaths(paths: string[]): Promise<void> {
    log('Reloading watcher paths:', paths);
    this.config.paths = paths;
    
    if (this.isActive) {
      await this.stop();
      await this.start();
    }
  }

  // Add or remove individual paths
  async addPath(path: string): Promise<void> {
    if (!this.config.paths.includes(path)) {
      this.config.paths.push(path);
      if (this.isActive) {
        await this.reloadPaths(this.config.paths);
      }
    }
  }

  async removePath(path: string): Promise<void> {
    const index = this.config.paths.indexOf(path);
    if (index !== -1) {
      this.config.paths.splice(index, 1);
      if (this.isActive) {
        await this.reloadPaths(this.config.paths);
      }
    }
  }
}

// Type definitions for event handlers
export interface FileSystemWatcher {
  on(event: 'database-event', listener: (event: DatabaseEvent) => void): this;
  on(event: 'database-add', listener: (event: DatabaseEvent) => void): this;
  on(event: 'database-change', listener: (event: DatabaseEvent) => void): this;
  on(event: 'database-unlink', listener: (event: DatabaseEvent) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'started' | 'ready' | 'stopped', listener: (info: { serverId: string; paths?: string[]; timestamp?: Date }) => void): this;
}