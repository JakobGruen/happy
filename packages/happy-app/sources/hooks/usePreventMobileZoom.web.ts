import { useEffect } from 'react';

// Completely disable all zoom on mobile web.
// This app behaves like a native app — zoom is never desired.
//
// IMPORTANT: +html.tsx is only used during static export (expo export).
// In dev mode, Expo serves its own HTML template. So ALL fixes must
// live here in the React hook, not in the HTML template.
//
// Three layers:
// 1. Viewport meta tag — updated at runtime (maximum-scale, interactive-widget)
// 2. CSS injection — font-size 16px on inputs, touch-action, text-size-adjust
// 3. Event listeners — touchstart font enforcement, gesture/double-tap blocking,
//    modal scroll prevention
export function usePreventMobileZoom() {
    useEffect(() => {
        if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

        // --- Layer 1: Update viewport meta tag ---
        const meta = document.querySelector('meta[name=viewport]');
        if (meta) {
            meta.setAttribute('content',
                'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, interactive-widget=resizes-content'
            );
        }

        // --- Layer 2: Inject CSS ---
        const style = document.createElement('style');
        style.id = 'prevent-mobile-zoom';
        style.textContent = `
            html {
                touch-action: manipulation;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
            }
            input, textarea, select {
                font-size: 16px !important;
            }
        `;
        document.head.appendChild(style);

        // --- Layer 3: Event listeners ---
        const prevent = (e: Event) => e.preventDefault();

        // Block pinch zoom (iOS gesture events)
        document.addEventListener('gesturestart', prevent, { passive: false } as EventListenerOptions);
        document.addEventListener('gesturechange', prevent, { passive: false } as EventListenerOptions);

        // Block double-tap zoom
        let lastTouchEnd = 0;
        const onTouchEnd = (e: TouchEvent) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        };
        document.addEventListener('touchend', onTouchEnd, { passive: false });

        // Force 16px BEFORE focus via touchstart (not focusin which is too late).
        // Safari checks font-size between touchstart and focusin to decide on zoom.
        const onTouchStart = (e: TouchEvent) => {
            let el = e.target as HTMLElement | null;
            while (el && el !== document.documentElement) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                    const size = parseFloat(window.getComputedStyle(el).fontSize);
                    if (size < 16) {
                        el.style.setProperty('font-size', '16px', 'important');
                    }
                    break;
                }
                el = el.parentElement;
            }
        };
        document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });

        // Prevent iOS Safari from scrolling the layout viewport when focusing
        // an input inside a fixed-position modal. Safari scrolls to bring the
        // input into view, which displaces the entire modal off-screen.
        // ONLY for inputs inside modals — the main chat input should scroll normally.
        const isInsideModal = (el: HTMLElement): boolean => {
            let node: HTMLElement | null = el;
            while (node) {
                if (node.getAttribute('aria-modal') === 'true' || node.getAttribute('role') === 'dialog') {
                    return true;
                }
                node = node.parentElement;
            }
            return false;
        };

        const onFocusIn = (e: FocusEvent) => {
            const el = e.target as HTMLElement;
            if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && isInsideModal(el)) {
                window.scrollTo(0, 0);
                setTimeout(() => window.scrollTo(0, 0), 100);
                setTimeout(() => window.scrollTo(0, 0), 300);
            }
        };
        document.addEventListener('focusin', onFocusIn, true);

        // Counteract any scroll during keyboard animation — only when modal input is active
        const onScroll = () => {
            const active = document.activeElement as HTMLElement | null;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && isInsideModal(active)) {
                window.scrollTo(0, 0);
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            meta?.setAttribute('content', 'width=device-width, initial-scale=1, shrink-to-fit=no');
            document.getElementById('prevent-mobile-zoom')?.remove();
            document.removeEventListener('gesturestart', prevent);
            document.removeEventListener('gesturechange', prevent);
            document.removeEventListener('touchend', onTouchEnd);
            document.removeEventListener('touchstart', onTouchStart, true);
            document.removeEventListener('focusin', onFocusIn, true);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);
}
