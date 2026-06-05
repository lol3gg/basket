export const INITIAL_BUDGET = 500;
export const AUCTION_SECONDS = 15;
export const CLOSE_SECONDS = 6;
export const SETUP_STORAGE_KEY = 'asta_setup_v1';

export const COACH_COLORS = [
  '#E8522A',
  '#FF6B2B',
  '#FF8C42',
  '#D94E0F',
  '#FF7043',
  '#C44E12',
  '#FF5722',
  '#B8380F',
];

export const PLAYER_COUNT = 16;
export const BANDITORE_KEY = 'banditore';
export const BANDITORE_PASSWORD = 'carletti';

export function isBanditoreRole(roleOrId) {
  return roleOrId === BANDITORE_KEY;
}

export function getJoinedCoaches(coaches) {
  return (coaches || []).filter((c) => (c.name || '').trim());
}

export function getCoachDisplayName(coach) {
  if (!coach) return '—';
  const name = (coach.name || '').trim();
  return name || '—';
}

export function joinCoachIntoState(coaches, requestedId, name, budget = INITIAL_BUDGET) {
  const trimmedName = name.trim();
  const list = coaches || [];

  const reqId = Number.isFinite(Number(requestedId)) ? Number(requestedId) : null;

  if (reqId) {
    const byRequestedId = list.find((c) => c.id === reqId);
    if (byRequestedId) {
      return {
        coaches: list.map((c) => (
          c.id === reqId ? { ...c, name: trimmedName || c.name, online: true } : c
        )),
        coachId: reqId,
      };
    }
  }

  const byName = list.find((c) => c.name.trim() === trimmedName);
  if (byName) {
    return {
      coaches: list.map((c) => (c.id === byName.id ? { ...c, online: true } : c)),
      coachId: byName.id,
    };
  }

  const nextId = list.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  const newCoach = { id: nextId, name: trimmedName, budget, players: [], online: true };
  return { coaches: [...list, newCoach], coachId: nextId };
}

export function getDefaultSetup() {
  return {
    players: Array.from({ length: PLAYER_COUNT }, (_, i) => ({
      id: i + 1,
      name: `Giocatore ${i + 1}`,
      role: ['G', 'A', 'C'][i % 3],
      team: '—',
    })),
    coaches: Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `Allenatore ${i + 1}`,
    })),
  };
}

function normalizeSetup(parsed) {
  const defaults = getDefaultSetup();
  const players = parsed?.players?.length ? parsed.players : defaults.players;
  const coaches = parsed?.coaches?.length ? parsed.coaches : defaults.coaches;
  return { players, coaches };
}

export function loadSetup() {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return getDefaultSetup();
    const parsed = JSON.parse(raw);
    if (!parsed?.players?.length) return getDefaultSetup();
    return normalizeSetup(parsed);
  } catch {
    return getDefaultSetup();
  }
}

export function saveSetup(setup) {
  localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(normalizeSetup(setup)));
}

export function createSetupCoach(existingCoaches, fields = {}) {
  const nextId = existingCoaches.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  const name = typeof fields.name === 'string' ? fields.name.trim() : '';
  return {
    id: nextId,
    name: name || `Allenatore ${nextId}`,
  };
}

export function setupCoachesToGameCoaches(setupCoaches, existingCoaches = []) {
  return (setupCoaches || []).map((sc) => {
    const prev = existingCoaches.find((c) => c.id === sc.id);
    return {
      id: sc.id,
      name: (sc.name || '').trim() || `Allenatore ${sc.id}`,
      budget: prev?.budget ?? INITIAL_BUDGET,
      players: prev?.players ?? [],
      online: prev?.online ?? false,
    };
  });
}

export function getSetupCoachName(setup, coachId) {
  const coach = setup.coaches?.find((c) => c.id === coachId);
  return (coach?.name || '').trim() || null;
}

export function getAppBaseUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export function buildCoachInviteLink(stanzaCode, coachId) {
  const base = getAppBaseUrl();
  const params = new URLSearchParams({
    stanza: stanzaCode.trim().toUpperCase(),
    coach: String(coachId),
  });
  return `${base}?${params.toString()}`;
}

export function buildShareAllMessage(stanzaCode, coaches) {
  const lines = (coaches || [])
    .filter((c) => (c.name || '').trim())
    .map((c) => `${c.name.trim()}: ${buildCoachInviteLink(stanzaCode, c.id)}`);
  return `🏀 ASTA TORNEO - entra dal tuo link:\n\n${lines.join('\n')}`;
}

export function parseDeepLinkFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const stanza = params.get('stanza')?.trim().toUpperCase();
  const coachRaw = params.get('coach');
  if (!stanza || !coachRaw) return null;
  const coachId = Number(coachRaw);
  if (!Number.isFinite(coachId) || coachId <= 0) return null;
  const setup = loadSetup();
  const name = getSetupCoachName(setup, coachId);
  if (!name) return null;
  return { stanza, coachId, name };
}

export function clearDeepLinkFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('stanza');
  url.searchParams.delete('coach');
  const search = url.searchParams.toString();
  window.history.replaceState({}, '', url.pathname + (search ? `?${search}` : '') + url.hash);
}

export function buildInitialCoaches() {
  return [];
}

export function setupPlayerToGamePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    team: p.team || '—',
    status: 'available',
    coachId: null,
  };
}

export function addSetupPlayer(setupPlayers, fields = {}) {
  const next = createSetupPlayer(setupPlayers, fields);
  return { setupPlayers: [...setupPlayers, next], gamePlayer: setupPlayerToGamePlayer(next) };
}

export function buildInitialPlayers() {
  const setup = loadSetup();
  return setup.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    team: p.team || '—',
    status: 'available',
    coachId: null,
  }));
}

export function createSetupPlayer(existingPlayers, fields = {}) {
  const nextId = existingPlayers.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const defaultRole = ['G', 'A', 'C'][(nextId - 1) % 3];
  const name = typeof fields.name === 'string' ? fields.name.trim() : '';
  const team = typeof fields.team === 'string' ? fields.team.trim() : '';
  return {
    id: nextId,
    name: name || `Giocatore ${nextId}`,
    role: fields.role || defaultRole,
    team: team || '—',
  };
}

export function mergeSetupIntoPlayers(existingPlayers, setupPlayers) {
  return setupPlayers.map((sp) => {
    const prev = existingPlayers.find((p) => p.id === sp.id);
    if (prev) {
      return { ...prev, name: sp.name, role: sp.role, team: sp.team || '—' };
    }
    return {
      id: sp.id,
      name: sp.name,
      role: sp.role,
      team: sp.team || '—',
      status: 'available',
      coachId: null,
    };
  });
}

export function splitPlayerName(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length <= 1) return { line1: parts[0] || '—', line2: '' };
  return { line1: parts[0], line2: parts.slice(1).join(' ') };
}

export function getCoachColor(coachId) {
  if (!coachId) return '#E8522A';
  return COACH_COLORS[(coachId - 1) % COACH_COLORS.length];
}

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches
    || /Android|iPhone|iPad|iPod|Mobile|webOS|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function createJoinRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `join-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
