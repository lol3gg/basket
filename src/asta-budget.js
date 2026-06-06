import { BANDITORE_COACH_ID, getCoachDisplayName, getJoinedCoaches } from './asta-setup.js';

/** Posti in rosa per ogni allenatore */
export const ROSTER_SLOTS = 5;

export function getRemainingRosterSlots(coach) {
  const owned = coach?.players?.length ?? 0;
  return Math.max(0, ROSTER_SLOTS - owned);
}

/** Massimo offribile rispettando la riserva (1 cr. per ogni posto ancora da riempire). */
export function getMaxBidAmount(coach) {
  const budget = coach?.budget ?? 0;
  const postiRimasti = getRemainingRosterSlots(coach);
  if (postiRimasti === 0) return 0;
  return Math.max(0, budget - (postiRimasti - 1));
}

export function isBudgetMinimum(coach) {
  const budget = coach?.budget ?? 0;
  const postiRimasti = getRemainingRosterSlots(coach);
  return postiRimasti > 0 && budget === postiRimasti;
}

export function isInBudgetReserve(coach) {
  const budget = coach?.budget ?? 0;
  return getMaxBidAmount(coach) < budget;
}

export function canAffordBid(coach, amount) {
  if (!coach || amount < 1) return false;
  if (getRemainingRosterSlots(coach) === 0) return false;
  return amount <= getMaxBidAmount(coach);
}

export function buildMobileBidOptions(currentBid) {
  return [
    { label: '+1', amount: Math.max(currentBid + 1, 1) },
    { label: '+5', amount: currentBid + 5 },
    { label: '+10', amount: currentBid + 10 },
  ];
}

export function buildBidOptions(currentBid, coach) {
  if (!coach) return { options: [], maxBid: 0, inReserve: false };

  const minBid = Math.max(currentBid + 1, 1);
  const maxBid = getMaxBidAmount(coach);
  const inReserve = isInBudgetReserve(coach);

  if (getRemainingRosterSlots(coach) === 0 || maxBid < minBid) {
    return { options: [], maxBid, inReserve };
  }

  if (!inReserve) {
    const standard = [
      { label: '+1', amount: Math.max(currentBid + 1, 1) },
      { label: '+5', amount: currentBid + 5 },
      { label: '+10', amount: currentBid + 10 },
      { label: '+25', amount: currentBid + 25 },
    ];
    return {
      options: standard.filter((o) => o.amount <= maxBid && o.amount >= minBid),
      maxBid,
      inReserve: false,
    };
  }

  const amounts = new Set([minBid, maxBid]);
  [currentBid + 1, currentBid + 5, currentBid + 10].forEach((a) => {
    if (a >= minBid && a <= maxBid) amounts.add(a);
  });

  const sorted = [...amounts].sort((a, b) => a - b);
  return {
    options: sorted.map((amount) => ({
      label: amount === maxBid ? `${amount}` : String(amount),
      amount,
    })),
    maxBid,
    inReserve: true,
  };
}

export function anyCoachCanBid(coaches) {
  return getJoinedCoaches(coaches).some(
    (c) => getRemainingRosterSlots(c) > 0 && getMaxBidAmount(c) >= 1,
  );
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Assegna giocatori rimasti a allenatori con rosa incompleta a 1 credito (sorteggio casuale). */
export function applyForcedRosterAssignments(state) {
  const available = (state.players || []).filter((p) => p.status === 'available');
  const needyCoaches = getJoinedCoaches(state.coaches || []).filter(
    (c) => getRemainingRosterSlots(c) > 0 && c.budget >= 1,
  );

  if (available.length === 0 || needyCoaches.length === 0) {
    return { state, logLines: [] };
  }

  let players = [...state.players];
  let coaches = [...state.coaches];
  const logLines = [];
  const shuffled = shuffle(available);

  for (const player of shuffled) {
    const eligible = getJoinedCoaches(coaches).filter(
      (c) => getRemainingRosterSlots(c) > 0 && c.budget >= 1,
    );
    if (eligible.length === 0) break;

    const coach = eligible[Math.floor(Math.random() * eligible.length)];

    players = players.map((p) => (
      p.id === player.id ? { ...p, status: 'assigned', coachId: coach.id } : p
    ));
    coaches = coaches.map((c) => {
      if (c.id !== coach.id) return c;
      return {
        ...c,
        budget: c.budget - 1,
        players: [...c.players, { id: player.id, name: player.name, role: player.role, price: 1 }],
      };
    });
    logLines.push(
      `${player.name} assegnato automaticamente a ${getCoachDisplayName(coach)} per 1 cr. (budget minimo)`,
    );
  }

  return {
    state: { ...state, players, coaches },
    logLines,
  };
}

export function maybeApplyForcedAssignments(state) {
  const available = (state.players || []).filter((p) => p.status === 'available');
  const needyCoaches = getJoinedCoaches(state.coaches || []).filter(
    (c) => getRemainingRosterSlots(c) > 0,
  );

  if (available.length === 0 || needyCoaches.length === 0) {
    return { state, logLines: [] };
  }

  if (anyCoachCanBid(state.coaches)) {
    return { state, logLines: [] };
  }

  return applyForcedRosterAssignments(state);
}
