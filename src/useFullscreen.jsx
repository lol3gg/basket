import { useState, useEffect, useCallback } from 'react';

const WANTS_FULLSCREEN_KEY = 'asta-wants-fullscreen';
const REENTER_DELAY_MS = 120;

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

function readWantsFullscreen() {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(WANTS_FULLSCREEN_KEY) === '1';
}

function writeWantsFullscreen(value) {
  if (typeof sessionStorage === 'undefined') return;
  if (value) sessionStorage.setItem(WANTS_FULLSCREEN_KEY, '1');
  else sessionStorage.removeItem(WANTS_FULLSCREEN_KEY);
}

const wantsFullscreenRef = { current: readWantsFullscreen() };
const subscribers = new Set();
let listenersAttached = false;
let reenterTimer = null;

function getIsFullscreen() {
  return Boolean(getFullscreenElement());
}

function notifySubscribers() {
  subscribers.forEach((fn) => fn());
}

function setWantsFullscreen(value) {
  wantsFullscreenRef.current = value;
  writeWantsFullscreen(value);
}

function cancelReenter() {
  if (reenterTimer) {
    clearTimeout(reenterTimer);
    reenterTimer = null;
  }
}

async function enterFullscreen() {
  if (!isFullscreenSupported() || getIsFullscreen()) return;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch (err) {
    console.error('fullscreen error:', err);
  }
}

async function exitFullscreen() {
  if (!getIsFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
  } catch (err) {
    console.error('exit fullscreen error:', err);
  }
}

function scheduleReenter() {
  cancelReenter();
  reenterTimer = setTimeout(() => {
    reenterTimer = null;
    if (wantsFullscreenRef.current && !getIsFullscreen()) {
      enterFullscreen();
    }
  }, REENTER_DELAY_MS);
}

function tryRestoreFullscreen() {
  if (!isFullscreenSupported()) return;
  if (wantsFullscreenRef.current && !getIsFullscreen()) {
    enterFullscreen();
  }
}

function attachGlobalListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  const onFullscreenChange = () => {
    notifySubscribers();
    if (!getIsFullscreen() && wantsFullscreenRef.current) {
      scheduleReenter();
    }
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    if (!getIsFullscreen() && !wantsFullscreenRef.current) return;
    setWantsFullscreen(false);
    cancelReenter();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      tryRestoreFullscreen();
    }
  };

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(getIsFullscreen);

  useEffect(() => {
    attachGlobalListeners();
    const update = () => setIsFullscreen(getIsFullscreen());
    subscribers.add(update);
    update();
    tryRestoreFullscreen();
    return () => subscribers.delete(update);
  }, []);

  const enter = useCallback(async () => {
    setWantsFullscreen(true);
    cancelReenter();
    await enterFullscreen();
    notifySubscribers();
  }, []);

  const exit = useCallback(async () => {
    setWantsFullscreen(false);
    cancelReenter();
    await exitFullscreen();
    notifySubscribers();
  }, []);

  const toggle = useCallback(async () => {
    if (getIsFullscreen()) await exit();
    else await enter();
  }, [enter, exit]);

  return { isFullscreen, toggle, enter, exit, supported: isFullscreenSupported() };
}

if (typeof document !== 'undefined' && isFullscreenSupported()) {
  attachGlobalListeners();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryRestoreFullscreen, { once: true });
  } else {
    queueMicrotask(tryRestoreFullscreen);
  }
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
