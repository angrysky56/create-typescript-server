# Workspace DB Manager

An MCP (Model Context Protocol) server for managing workspace databases with filesystem integration.

## Features

- Automatic SQLite database discovery and management
- Real-time filesystem monitoring
- Database state tracking and management
- Cross-database operations support
- TypeScript/ES Module architecture

## Installation

```bash
npm install
npm run build
```

## Usage

```typescript
import { WorkspaceManager } from 'workspace-db-manager';

// Create server instance
const manager = new WorkspaceManager({
  watchPaths: ['/path/to/workspace'],
  database: {
    path: 'core.db',
    verbose: true
  },
  monitor: {
    pollInterval: 1000,
    usePolling: true
  }
});

// Start server
await manager.start();

// Handle MCP messages
const response = await manager.handleMessage({
  type: 'list_databases'
});

console.log('Managed databases:', response.data.databases);
```

## MCP Message Types

### Status
Get server status:
```typescript
const response = await manager.handleMessage({ type: 'status' });
// Returns: uptime, database count, watched paths, etc.
```

### Database Operations
List managed databases:
```typescript
const response = await manager.handleMessage({ type: 'list_databases' });
// Returns: array of managed databases with status
```

Get database info:
```typescript
const response = await manager.handleMessage({
  type: 'database_info',
  data: { path: 'path/to/database.db' }
});
// Returns: detailed database information including tables
```

Attach database:
```typescript
const response = await manager.handleMessage({
  type: 'attach_database',
  data: { path: 'path/to/database.db' }
});
```

Detach database:
```typescript
const response = await manager.handleMessage({
  type: 'detach_database',
  data: { path: 'path/to/database.db' }
});
```

### Path Management
Update watched paths:
```typescript
const response = await manager.handleMessage({
  type: 'update_paths',
  data: {
    operation: 'add', // or 'set', 'remove'
    paths: ['/new/path/to/watch']
  }
});
```

List watched paths:
```typescript
const response = await manager.handleMessage({ type: 'list_paths' });
```

## Events

The server emits various events:
```typescript
manager.on('event', (event) => {
  // Handle server events
  switch (event.type) {
    case 'database:added':
      console.log('New database:', event.path);
      break;
    case 'database:changed':
      console.log('Database changed:', event.path);
      break;
    case 'database:removed':
      console.log('Database removed:', event.path);
      break;
  }
});
```

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Development mode
npm run dev
```

## License

MIT