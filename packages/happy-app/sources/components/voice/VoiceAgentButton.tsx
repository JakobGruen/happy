import * as React from 'react';
import { Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from '@/components/haptics';
import { Octicons } from '@expo/vector-icons';

interface VoiceAgentButtonProps {
    onPress: () => void;
    isActive: boolean;
    isConnecting: boolean;
}

export const VoiceAgentButton = React.memo(function VoiceAgentButton(props: VoiceAgentButtonProps) {
    const { theme } = useUnistyles();

    return (
        <Pressable
            style={(p) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: props.isActive
                    ? theme.colors.button.primary.background
                    : 'transparent',
                opacity: p.pressed ? 0.7 : 1,
            })}
            hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
            onPress={() => {
                hapticsLight();
                props.onPress();
            }}
            disabled={props.isConnecting}
        >
            {props.isActive ? (
                <Octicons
                    name="stop"
                    size={14}
                    color={theme.colors.button.primary.tint}
                />
            ) : (
                <Image
                    source={require('@/assets/images/icon-voice-white.png')}
                    style={{ width: 20, height: 20 }}
                    tintColor={theme.colors.button.secondary.tint}
                />
            )}
        </Pressable>
    );
});
