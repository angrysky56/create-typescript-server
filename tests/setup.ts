import { afterEach, beforeEach } from 'vitest';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

// Test environment setup
const TEST_DIR = join(process.cwd(), 'test-workspace');

beforeEach(() => {
  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test directory
  rmSync(TEST_DIR, { recursive: true, force: true });
});