import * as React from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Manages image attachments for chat input.
 * - pickImage: opens device image picker, resizes to max 2048px, converts to base64
 * - addRawAttachment: adds a raw base64 image (for web clipboard paste)
 * - removeAttachment / clearAttachments: manage attachment list
 * Max 4 attachments per message.
 */

const MAX_ATTACHMENTS = 4;
const MAX_DIMENSION = 2048;

export interface ImageAttachment {
    id: string;
    base64: string;
    mediaType: string;
    uri: string;
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useImageAttachment() {
    const [attachments, setAttachments] = React.useState<ImageAttachment[]>([]);

    const pickImage = React.useCallback(async () => {
        if (attachments.length >= MAX_ATTACHMENTS) return;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            base64: false,
            allowsMultipleSelection: false,
        });

        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const width = asset.width;
        const height = asset.height;

        // Resize if either dimension exceeds MAX_DIMENSION
        let resize: { width: number; height: number } | undefined;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width >= height) {
                resize = { width: MAX_DIMENSION, height: Math.round(height * (MAX_DIMENSION / width)) };
            } else {
                resize = { width: Math.round(width * (MAX_DIMENSION / height)), height: MAX_DIMENSION };
            }
        }

        const manipulated = await manipulateAsync(
            asset.uri,
            resize ? [{ resize }] : [],
            { compress: 0.8, format: SaveFormat.JPEG, base64: true }
        );

        if (!manipulated.base64) return;

        setAttachments(prev => {
            if (prev.length >= MAX_ATTACHMENTS) return prev;
            return [...prev, {
                id: generateId(),
                base64: manipulated.base64!,
                mediaType: 'image/jpeg',
                uri: manipulated.uri,
            }];
        });
    }, [attachments.length]);

    const addRawAttachment = React.useCallback((base64: string, mediaType: string, uri: string) => {
        setAttachments(prev => {
            if (prev.length >= MAX_ATTACHMENTS) return prev;
            return [...prev, { id: generateId(), base64, mediaType, uri }];
        });
    }, []);

    const removeAttachment = React.useCallback((id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    }, []);

    const clearAttachments = React.useCallback(() => {
        setAttachments([]);
    }, []);

    return { attachments, pickImage, addRawAttachment, removeAttachment, clearAttachments };
}
