import { useState, useEffect, useCallback } from 'react';

function getFullscreenElement() {
  return document.fullscreenElement
    ?? document.webkitFullscreenElement
    ?? null;
}

function isFullscreenSupported() {
  return Boolean(
    document.documentElement.requestFullscreen
    ?? document.documentElement.webkitRequestFullscreen,
  );
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(getFullscreenElement()));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (err) {
      console.error('fullscreen error:', err);
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch (err) {
      console.error('exit fullscreen error:', err);
    }
  }, []);

  const toggle = useCallback(() => {
    if (getFullscreenElement()) exit();
    else enter();
  }, [enter, exit]);

  return { isFullscreen, toggle, enter, exit, supported: isFullscreenSupported() };
}

export function FullscreenToggle({ className = 'btn-ghost btn-fullscreen' }) {
  const { isFullscreen, toggle, supported } = useFullscreen();

  if (!supported) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={isFullscreen ? 'Esci da schermo intero (Esc)' : 'Schermo intero'}
      aria-pressed={isFullscreen}
    >
      {isFullscreen ? 'Esci schermo intero' : 'Schermo intero'}
    </button>
  );
}
