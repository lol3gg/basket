import Ably from 'ably';

export const isAblyConfigured = Boolean(import.meta.env.VITE_ABLY_KEY);

export function createAblyClient() {
  if (!isAblyConfigured) return null;
  return new Ably.Realtime({
    key: import.meta.env.VITE_ABLY_KEY,
    autoConnect: true,
  });
}

export function getChannelName(stanzaCode) {
  return `asta-${stanzaCode.trim().toUpperCase()}`;
}
