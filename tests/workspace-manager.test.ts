import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../src/index.js';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import type { ServerEvent } from '../src/types/server.js';

describe('WorkspaceManager', () => {
  const TEST_DIR = join(process.cwd(), 'test-workspace');
  let manager: WorkspaceManager;

  beforeEach(() => {
    manager = new WorkspaceManager({
      watchPaths: [TEST_DIR],
      database: {
        path: join(TEST_DIR, 'core.db'),
        verbose: false
      },
      monitor: {
        pollInterval: 100,
        usePolling: true
      }
    });
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('should start and stop cleanly', async () => {
    await expect(manager.start()).resolves.not.toThrow();
    expect(manager.getState().status).toBe('running');

    await expect(manager.stop()).resolves.not.toThrow();
    expect(manager.getState().status).toBe('stopped');
  });

  it('should detect new database files', async () => {
    const events: ServerEvent[] = [];
    manager.on('event', (event) => events.push(event));

    await manager.start();

    const dbPath = join(TEST_DIR, 'test.db');
    await writeFile(dbPath, 'test data');

    // Wait for file detection
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(events.some(e => e.type === 'database:added')).toBe(true);
    expect(manager.getState().databaseCount).toBe(1);
  });

  it('should handle database removal', async () => {
    const events: ServerEvent[] = [];
    manager.on('event', (event) => events.push(event));

    await manager.start();

    const dbPath = join(TEST_DIR, 'test.db');
    await writeFile(dbPath, 'test data');
    await new Promise(resolve => setTimeout(resolve, 500));

    await unlink(dbPath);
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(events.some(e => e.type === 'database:removed')).toBe(true);
    expect(manager.getState().databaseCount).toBe(0);
  });

  it('should handle MCP messages', async () => {
    await manager.start();

    // Test status message
    const statusResponse = await manager.handleMessage({ type: 'status' });
    expect(statusResponse.success).toBe(true);
    expect(statusResponse.data).toHaveProperty('status', 'running');

    // Test list databases message
    const listResponse = await manager.handleMessage({ type: 'list_databases' });
    expect(listResponse.success).toBe(true);
    expect(listResponse.data).toHaveProperty('databases');

    // Test invalid message
    const invalidResponse = await manager.handleMessage({ type: 'invalid' });
    expect(invalidResponse.success).toBe(false);
    expect(invalidResponse.error).toMatch(/unknown message type/i);
  });

  it('should manage watched paths', async () => {
    await manager.start();

    // Update paths
    const newPath = join(TEST_DIR, 'subdir');
    const response = await manager.handleMessage({
      type: 'update_paths',
      data: {
        operation: 'add',
        paths: [newPath]
      }
    });

    expect(response.success).toBe(true);
    expect(manager.getState().watchedPaths).toContain(newPath);
  });
});