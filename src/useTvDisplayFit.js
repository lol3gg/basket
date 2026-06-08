import { useEffect } from 'react';
import { isMobileDevice } from './asta-setup.js';

/** Area di riferimento 16:9 per banditore su TV / proiettore HDMI */
export const TV_DESIGN_WIDTH = 1600;
export const TV_DESIGN_HEIGHT = 900;
const TV_MIN_WIDTH = 1200;
const TV_MIN_HEIGHT = 650;
const TV_SAFE_MARGIN = 0.96;

function shouldUseTvLayout() {
  if (typeof window === 'undefined') return false;
  if (isMobileDevice()) return false;
  const force = new URLSearchParams(window.location.search).get('tv') === '1';
  const large = window.innerWidth >= TV_MIN_WIDTH && window.innerHeight >= TV_MIN_HEIGHT;
  return force || large;
}

function updateTvLayout() {
  const enabled = shouldUseTvLayout();
  const root = document.documentElement;

  root.classList.toggle('tv-layout', enabled);

  if (!enabled) {
    root.style.removeProperty('--tv-scale');
    return;
  }

  const scale = Math.min(
    (window.innerWidth * TV_SAFE_MARGIN) / TV_DESIGN_WIDTH,
    (window.innerHeight * TV_SAFE_MARGIN) / TV_DESIGN_HEIGHT,
  );
  root.style.setProperty('--tv-scale', String(scale));
}

export function useTvDisplayFit() {
  useEffect(() => {
    updateTvLayout();
    window.addEventListener('resize', updateTvLayout);
    window.addEventListener('orientationchange', updateTvLayout);
    return () => {
      window.removeEventListener('resize', updateTvLayout);
      window.removeEventListener('orientationchange', updateTvLayout);
      document.documentElement.classList.remove('tv-layout');
      document.documentElement.style.removeProperty('--tv-scale');
    };
  }, []);
}
