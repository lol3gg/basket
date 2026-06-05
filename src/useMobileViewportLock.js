import { useEffect } from 'react';
import { isMobileDevice } from './asta-setup.js';

const VIEWPORT_DEFAULT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

/** Blocca scroll e zoom su schermate allenatore (mobile). */
export function useMobileViewportLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined' || !isMobileDevice()) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const meta = document.querySelector('meta[name="viewport"]');
    const previousViewport = meta?.getAttribute('content') ?? VIEWPORT_DEFAULT;

    meta?.setAttribute('content', VIEWPORT_LOCKED);
    root.classList.add('mobile-viewport-lock');
    body.classList.add('mobile-viewport-lock');

    const blockScroll = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      e.preventDefault();
    };

    let lastTouchEnd = 0;
    const blockDoubleTapZoom = (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    };

    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('touchend', blockDoubleTapZoom, { passive: false });

    return () => {
      meta?.setAttribute('content', previousViewport);
      root.classList.remove('mobile-viewport-lock');
      body.classList.remove('mobile-viewport-lock');
      document.removeEventListener('touchmove', blockScroll);
      document.removeEventListener('touchend', blockDoubleTapZoom);
    };
  }, [active]);
}
