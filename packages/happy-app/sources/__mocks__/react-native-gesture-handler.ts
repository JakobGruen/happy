// Minimal react-native-gesture-handler stub for Vitest (Node.js environment).
const noop = () => builder;
const builder: Record<string, unknown> = {};
const methods = [
    'activeOffsetX', 'failOffsetY', 'onBegin', 'onChange', 'onEnd',
];
for (const m of methods) {
    builder[m] = noop;
}

export const Gesture = {
    Pan: () => builder,
};
export const GestureDetector = 'GestureDetector';
