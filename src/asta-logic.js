import {
  AUCTION_SECONDS,
  INITIAL_BUDGET,
  loadSetup,
  mergeSetupIntoPlayers,
} from './asta-setup.js';

export function samePlayerId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function findPlayerById(players, playerId) {
  return (players || []).find((p) => samePlayerId(p.id, playerId));
}

export { findPlayerById };

function stripPlayerPhoto(player) {
  if (!player) return player;
  const { photo, ...rest } = player;
  return rest;
}

/** Ably ~64KB: mai inviare foto (restano solo in localStorage sul PC banditore). */
export function toNetworkGameState(state) {
  if (!state) return state;
  return {
    ...state,
    players: (state.players || []).map(stripPlayerPhoto),
    currentPlayer: stripPlayerPhoto(state.currentPlayer),
    log: Array.isArray(state.log) ? state.log.slice(-30) : [],
  };
}

function findCoachOwningPlayer(state, playerId) {
  const player = findPlayerById(state.players, playerId);
  if (player?.coachId != null) {
    const byCoachId = state.coaches.find((c) => samePlayerId(c.id, player.coachId));
    if (byCoachId) return byCoachId;
  }
  return (state.coaches || []).find((c) =>
    (c.players || []).some((rp) => samePlayerId(rp.id, playerId)),
  );
}

function logReAuctionDebug(label, data) {
  if (import.meta.env?.DEV) {
    console.log(`[RIASTA] ${label}`, data);
  }
}

/** Disconnette un allenatore (slot fisso) e ripristina i suoi giocatori. */
export function disconnectCoachFromState(state, coachId, budget = INITIAL_BUDGET) {
  const coach = state.coaches.find((c) => c.id === coachId);
  if (!coach) return state;

  const rosterIds = new Set(coach.players.map((p) => p.id));
  const players = state.players.map((p) => {
    if (p.coachId === coachId || rosterIds.has(p.id)) {
      return { ...p, status: 'available', coachId: null };
    }
    return p;
  });

  const wasLeading = state.currentBidder === coachId;

  return {
    ...state,
    coaches: state.coaches.map((c) => (
      c.id === coachId ? { ...c, budget, players: [], online: false } : c
    )),
    players,
    currentBidder: wasLeading ? null : state.currentBidder,
    currentBid: wasLeading ? 0 : state.currentBid,
  };
}

/** Rimuove un allenatore e ripristina i suoi giocatori come disponibili. */
export function removeCoachFromState(state, coachId) {
  const coach = state.coaches.find((c) => c.id === coachId);
  if (!coach) return state;

  const rosterIds = new Set(coach.players.map((p) => p.id));
  const players = state.players.map((p) => {
    if (p.coachId === coachId || rosterIds.has(p.id)) {
      return { ...p, status: 'available', coachId: null };
    }
    return p;
  });

  const wasLeading = state.currentBidder === coachId;

  return {
    ...state,
    coaches: state.coaches.filter((c) => c.id !== coachId),
    players,
    currentBidder: wasLeading ? null : state.currentBidder,
    currentBid: wasLeading ? 0 : state.currentBid,
  };
}

/** Resetta solo l'asta: mantiene giocatori e setup, azzera assegnazioni e connessioni. */
export function buildResetAuctionState(state) {
  const setup = loadSetup();
  const setupPlayers = setup.players.length > 0
    ? setup.players
    : state.players.map(({ id, name, role, team, photo }) => ({
      id,
      name,
      role,
      team: team || '—',
      ...(photo ? { photo } : {}),
    }));

  const players = mergeSetupIntoPlayers(state.players, setupPlayers).map((p) => ({
    ...p,
    status: 'available',
    coachId: null,
  }));

  return {
    ...state,
    currentPlayer: null,
    currentBid: 0,
    currentBidder: null,
    timer: AUCTION_SECONDS,
    phase: 'idle',
    isRunning: false,
    coaches: [],
    players,
  };
}

/** Rimette un giocatore assegnato in asta (senza avvio timer) e restituisce i crediti. */
export function buildReAuctionPlayerState(state, playerId) {
  logReAuctionDebug('input', {
    playerId,
    phase: state.phase,
    player: findPlayerById(state.players, playerId),
    coaches: state.coaches?.map((c) => ({
      id: c.id,
      budget: c.budget,
      rosterIds: c.players?.map((p) => p.id),
    })),
  });

  const player = findPlayerById(state.players, playerId);
  if (!player) {
    logReAuctionDebug('abort', 'giocatore non trovato');
    return null;
  }

  const onRoster = findCoachOwningPlayer(state, playerId);
  const isAssigned = player.status === 'assigned' || Boolean(onRoster);
  if (!isAssigned) {
    logReAuctionDebug('abort', 'giocatore non assegnato');
    return null;
  }

  const coach = onRoster;
  if (!coach) {
    logReAuctionDebug('abort', 'allenatore non trovato');
    return null;
  }

  const coachId = coach.id;
  const rosterEntry = (coach.players || []).find((rp) => samePlayerId(rp.id, playerId));
  const price = rosterEntry?.price ?? 0;

  const coaches = state.coaches.map((c) => {
    if (!samePlayerId(c.id, coachId)) return c;
    return {
      ...c,
      budget: c.budget + price,
      players: (c.players || []).filter((rp) => !samePlayerId(rp.id, playerId)),
    };
  });

  const players = state.players.map((p) => (
    samePlayerId(p.id, playerId)
      ? { ...p, status: 'available', coachId: null }
      : p
  ));

  const refreshedPlayer = findPlayerById(players, playerId);

  const nextState = {
    ...state,
    coaches,
    players,
    currentPlayer: refreshedPlayer,
    currentBid: 0,
    currentBidder: null,
    phase: 'live',
    isRunning: false,
    timer: AUCTION_SECONDS,
  };

  logReAuctionDebug('output', {
    price,
    coachId,
    player: refreshedPlayer,
    coachBudget: coaches.find((c) => samePlayerId(c.id, coachId))?.budget,
    currentPlayer: nextState.currentPlayer,
    phase: nextState.phase,
    isRunning: nextState.isRunning,
  });

  return {
    state: nextState,
    price,
    coach,
  };
}

/** Annulla l'assegnazione e prepara lo stesso giocatore per una nuova asta. */
export function buildRestartPlayerState(state) {
  const player = state.currentPlayer;
  if (!player) return null;

  const { currentBid: bid, currentBidder: bidder } = state;
  const playerId = player.id;

  let coaches = state.coaches;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, status: 'available', coachId: null } : p,
  );

  if (bidder && bid > 0) {
    coaches = coaches.map((c) => {
      if (c.id !== bidder) return c;
      return {
        ...c,
        budget: c.budget + bid,
        players: c.players.filter((p) => p.id !== playerId),
      };
    });
  }

  const refreshedPlayer = players.find((p) => p.id === playerId);

  return {
    ...state,
    players,
    coaches,
    currentPlayer: refreshedPlayer,
    currentBid: 0,
    currentBidder: null,
    phase: 'live',
    isRunning: true,
    timer: AUCTION_SECONDS,
  };
}
