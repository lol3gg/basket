export const INITIAL_BUDGET = 500;
export const AUCTION_SECONDS = 15;
export const CLOSE_SECONDS = 6;
export const SETUP_STORAGE_KEY = 'asta_setup_v2';

export const COACH_COLORS = [
  '#3B82F6',
  '#60A5FA',
  '#818CF8',
  '#06B6D4',
  '#22C55E',
  '#F59E0B',
  '#A78BFA',
  '#EF4444',
];

export const PLAYER_COUNT = 16;
export const COACH_COUNT = 8;
export const BANDITORE_COACH_ID = 1;
/** @deprecated Usa BANDITORE_COACH_ID (coach id 1) */
export const BANDITORE_KEY = 'banditore';
export const BANDITORE_PASSWORD = 'carletti';

export function isBanditoreRole(coachId) {
  if (coachId === BANDITORE_KEY) return true;
  return Number(coachId) === BANDITORE_COACH_ID;
}

/** Banditore autenticato (PC + password), non un allenatore con id errato. */
export function isBanditoreConsole(coachId, sessionVerified) {
  return isBanditoreRole(coachId) && Boolean(sessionVerified);
}

export function getJoinedCoaches(coaches) {
  return (coaches || []).filter((c) => c.online && c.id !== BANDITORE_COACH_ID);
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
    if (reqId === BANDITORE_COACH_ID) {
      return { coaches: list, coachId: null, error: 'Slot riservato al banditore' };
    }
    const byRequestedId = list.find((c) => c.id === reqId);
    if (byRequestedId) {
      if (byRequestedId.online) {
        return { coaches: list, coachId: null, error: 'Questo nome è già connesso' };
      }
      return {
        coaches: list.map((c) => (
          c.id === reqId ? { ...c, name: trimmedName || c.name, online: true } : c
        )),
        coachId: reqId,
      };
    }
    if (reqId >= 1 && reqId <= COACH_COUNT) {
      return {
        coaches: [...list, { id: reqId, name: trimmedName, budget, players: [], online: true }],
        coachId: reqId,
      };
    }
  }

  const byName = list.find((c) => c.name.trim() === trimmedName);
  if (byName) {
    if (byName.online) {
      return { coaches: list, coachId: null, error: 'Questo nome è già connesso' };
    }
    return {
      coaches: list.map((c) => (c.id === byName.id ? { ...c, online: true } : c)),
      coachId: byName.id,
    };
  }

  const nextId = Math.max(
    list.reduce((max, c) => Math.max(max, c.id), BANDITORE_COACH_ID),
    BANDITORE_COACH_ID,
  ) + 1;
  const newCoach = { id: nextId, name: trimmedName, budget, players: [], online: true };
  return { coaches: [...list, newCoach], coachId: nextId };
}

export function getDefaultSetup() {
  return { players: [], coaches: [] };
}

export function getDemoSetup() {
  return {
    players: Array.from({ length: PLAYER_COUNT }, (_, i) => ({
      id: i + 1,
      name: `Giocatore ${i + 1}`,
      role: ['G', 'A', 'C'][i % 3],
      team: '—',
    })),
    coaches: [],
  };
}

function normalizeSetup(parsed) {
  const players = Array.isArray(parsed?.players) ? parsed.players : [];
  return { players, coaches: [] };
}

export function getEmptySetup() {
  return getDefaultSetup();
}

export function loadSetup() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('asta_setup_v1');
    }
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return getDefaultSetup();
    return normalizeSetup(JSON.parse(raw));
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
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') || window.location.origin;
}

export function buildShareInviteMessage(stanzaCode) {
  const url = getAppBaseUrl();
  const stanza = stanzaCode.trim().toUpperCase();
  return `🏀 ASTA TORNEO\n\nApri: ${url}\nNome stanza: ${stanza}\n\nInserisci il tuo nome e entra come allenatore.`;
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
  if (!coachId) return '#3B82F6';
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
