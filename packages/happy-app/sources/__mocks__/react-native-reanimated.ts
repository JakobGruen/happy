// Minimal react-native-reanimated stub for Vitest (Node.js environment).
export const useSharedValue = (init: unknown) => ({ value: init });
export const useAnimatedStyle = (fn: () => unknown) => fn();
export const withSpring = (value: unknown) => value;
export const runOnJS = (fn: (...args: unknown[]) => unknown) => fn;
const Animated = { View: 'Animated.View' };
export default Animated;
