import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock dependencies BEFORE importing the component
vi.mock('react-native', () => ({
    View: React.forwardRef((props, ref) => React.createElement('div', { ref, ...props })),
    Text: React.forwardRef((props, ref) => React.createElement('span', { ref, ...props })),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => {
            if (typeof fn === 'function') {
                return fn({ colors: { textSecondary: '#999' } });
            }
            return fn;
        }
    },
    useUnistyles: () => ({
        theme: { colors: { textSecondary: '#999' } }
    })
}));

// Mock VariableFormatter
vi.mock('../adaptive/VariableFormatter', () => ({
    VariableFormatter: React.forwardRef((props: any, ref) => 
        React.createElement('div', { ref, ...props }, `Value: ${props.value}`)
    )
}));

describe('VerticalParameterStack', () => {
    it('exports VerticalParameterStack component', async () => {
        const { VerticalParameterStack } = await import('../VerticalParameterStack');
        expect(VerticalParameterStack).toBeDefined();
    });

    it('component is a React memo', async () => {
        const { VerticalParameterStack } = await import('../VerticalParameterStack');
        // React.memo returns an object with $$typeof property
        expect(typeof VerticalParameterStack).toBe('object');
    });

    it('component exports properly', async () => {
        const module = await import('../VerticalParameterStack');
        expect(module).toHaveProperty('VerticalParameterStack');
    });
});
