import { describe, it, expect } from 'vitest';
import { ToolCall } from '@/sync/typesMessage';

// Helper function to calculate output count (DRY principle)
function getOutputCount(result: unknown): number {
  return result && typeof result === 'object' && !Array.isArray(result)
    ? Object.keys(result as Record<string, unknown>).length
    : 0;
}

// Factory function to create complete ToolCall objects
function createTestTool(overrides: Partial<ToolCall> = {}): ToolCall {
  const now = Date.now();
  return {
    name: 'test',
    state: 'completed',
    input: {},
    createdAt: now,
    startedAt: now,
    completedAt: now,
    description: null,
    ...overrides,
  };
}

describe('ToolModalTabs outputCount', () => {
  it('returns 0 for string results (not string length)', () => {
    const tool = createTestTool({ result: 'some string output' });
    expect(getOutputCount(tool.result)).toBe(0);
  });

  it('returns parameter count for object results', () => {
    const tool = createTestTool({ result: { name: 'value', status: 'ok' } });
    expect(getOutputCount(tool.result)).toBe(2);
  });

  it('returns 0 for array results', () => {
    const tool = createTestTool({ result: [1, 2, 3] });
    expect(getOutputCount(tool.result)).toBe(0);
  });

  it('returns 0 for null results', () => {
    const tool = createTestTool({ result: null });
    expect(getOutputCount(tool.result)).toBe(0);
  });

  it('returns 0 for number results', () => {
    const tool = createTestTool({ result: 42 });
    expect(getOutputCount(tool.result)).toBe(0);
  });

  it('returns 0 for boolean results', () => {
    const tool = createTestTool({ result: true });
    expect(getOutputCount(tool.result)).toBe(0);
  });
});
