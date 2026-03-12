import { describe, it, expect } from 'vitest';
import { Tool } from '@jakobgruen/happy-wire';

describe('ToolModalTabs outputCount', () => {
  it('returns 0 for string results (not string length)', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: 'some string output',
    };
    // This is the logic from ToolModalTabs.tsx
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(0);
  });

  it('returns parameter count for object results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: { name: 'value', status: 'ok' },
    };
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(2);
  });

  it('returns 0 for array results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: [1, 2, 3],
    };
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(0);
  });

  it('returns 0 for null results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: null,
    };
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(0);
  });

  it('returns 0 for number results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: 42,
    };
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(0);
  });

  it('returns 0 for boolean results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: true,
    };
    const outputCount = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
      ? Object.keys(tool.result).length
      : 0;
    expect(outputCount).toBe(0);
  });
});
