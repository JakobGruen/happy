import * as React from 'react';
import { View, Pressable, Dimensions, FlatList, Platform, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import { ImageAttachmentData } from '@/sync/typesMessage';

// --- Imperative manager (singleton, event-emitter pattern like Modal) ---

type ImageViewerState = {
    visible: boolean;
    images: ImageAttachmentData[];
    initialIndex: number;
};

type Listener = (state: ImageViewerState) => void;

class ImageViewerManagerClass {
    private listeners: Set<Listener> = new Set();
    private state: ImageViewerState = { visible: false, images: [], initialIndex: 0 };

    open(images: ImageAttachmentData[], initialIndex: number = 0) {
        this.state = { visible: true, images, initialIndex };
        this.notify();
    }

    close() {
        this.state = { visible: false, images: [], initialIndex: 0 };
        this.notify();
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    getState() {
        return this.state;
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }
}

export const ImageViewerManager = new ImageViewerManagerClass();

// --- Zoomable image page component ---

const SCREEN = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DISMISS_THRESHOLD = 100;

function ZoomableImage({ image, onDismiss }: { image: ImageAttachmentData; onDismiss: () => void }) {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
        })
        .onEnd(() => {
            if (scale.value < MIN_SCALE) {
                scale.value = withSpring(MIN_SCALE);
            }
            savedScale.value = scale.value;
        });

    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (savedScale.value > 1) {
                translateX.value = savedTranslateX.value + e.translationX;
                translateY.value = savedTranslateY.value + e.translationY;
            } else {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (savedScale.value > 1) {
                savedTranslateX.value = translateX.value;
                savedTranslateY.value = translateY.value;
            } else {
                if (Math.abs(translateY.value) > DISMISS_THRESHOLD) {
                    runOnJS(onDismiss)();
                } else {
                    translateY.value = withSpring(0);
                }
            }
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > 1) {
                scale.value = withTiming(1);
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedScale.value = 1;
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                scale.value = withTiming(2);
                savedScale.value = 2;
            }
        });

    const singleTapGesture = Gesture.Tap()
        .onEnd(() => {
            if (savedScale.value <= 1) {
                runOnJS(onDismiss)();
            }
        });

    const composed = Gesture.Race(
        doubleTapGesture,
        Gesture.Simultaneous(pinchGesture, panGesture),
    );

    // Wrap single tap to not interfere with double tap
    const allGestures = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
    const finalGesture = Gesture.Race(
        Gesture.Simultaneous(pinchGesture, panGesture),
        allGestures,
    );

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    return (
        <GestureDetector gesture={finalGesture}>
            <Animated.View style={[{ width: SCREEN.width, height: SCREEN.height, justifyContent: 'center', alignItems: 'center' }, animatedStyle]}>
                <Image
                    source={{ uri: `data:${image.mediaType};base64,${image.data}` }}
                    style={{ width: SCREEN.width, height: SCREEN.height }}
                    contentFit="contain"
                />
            </Animated.View>
        </GestureDetector>
    );
}

// --- Main ImageViewer component (mount once in root layout) ---

export const ImageViewer = React.memo(function ImageViewer() {
    const [state, setState] = React.useState<ImageViewerState>({ visible: false, images: [], initialIndex: 0 });

    React.useEffect(() => {
        return ImageViewerManager.subscribe(setState);
    }, []);

    const handleDismiss = React.useCallback(() => {
        ImageViewerManager.close();
    }, []);

    if (!state.visible || state.images.length === 0) {
        return null;
    }

    return (
        <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.95)',
            zIndex: 9999,
        }}>
            {Platform.OS !== 'web' && <StatusBar hidden />}

            {/* Close button */}
            <Pressable
                onPress={handleDismiss}
                style={{
                    position: 'absolute',
                    top: 50,
                    right: 20,
                    zIndex: 10000,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <Ionicons name="close" size={22} color="white" />
            </Pressable>

            {/* Gallery */}
            {state.images.length === 1 ? (
                <ZoomableImage image={state.images[0]} onDismiss={handleDismiss} />
            ) : (
                <FlatList
                    data={state.images}
                    horizontal
                    pagingEnabled
                    initialScrollIndex={state.initialIndex}
                    getItemLayout={(_, index) => ({
                        length: SCREEN.width,
                        offset: SCREEN.width * index,
                        index,
                    })}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, i) => i.toString()}
                    renderItem={({ item }) => (
                        <ZoomableImage image={item} onDismiss={handleDismiss} />
                    )}
                />
            )}

            {/* Page indicator dots */}
            {state.images.length > 1 && (
                <View style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 0,
                    right: 0,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                }}>
                    {state.images.map((_, i) => (
                        <View
                            key={i}
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: i === state.initialIndex ? 'white' : 'rgba(255,255,255,0.4)',
                            }}
                        />
                    ))}
                </View>
            )}
        </View>
    );
});
