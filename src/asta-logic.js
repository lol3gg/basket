import { AUCTION_SECONDS } from './asta-setup.js';

/** Disconnette un allenatore (slot fisso) e ripristina i suoi giocatori. */
export function disconnectCoachFromState(state, coachId, budget = 500) {
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
