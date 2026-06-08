/**
 * Test funzionali della logica asta (senza browser).
 * Esegui: npm test
 */
import {
  samePlayerId,
  findPlayerById,
  buildReAuctionPlayerState,
  buildResetAuctionState,
  buildRestartPlayerState,
  disconnectCoachFromState,
  toNetworkGameState,
} from '../src/asta-logic.js';
import {
  INITIAL_BUDGET,
  BANDITORE_COACH_ID,
  isBanditoreConsole,
  isBanditoreRole,
  joinCoachIntoState,
  getDemoSetup,
  DEMO_PLAYER_COUNT,
  PLAYER_COUNT,
  COACH_COUNT,
  mergeOfficialRoster,
  syncPlayersFromStorage,
  buildRosterSlotList,
  getDefaultSetup,
} from '../src/asta-setup.js';
import {
  validateBidAmount,
  getBidValidationError,
  getPurchasedPlayerCount,
  getRemainingRosterSlots,
  getMaxBidAmount,
  buildMobileBidOptions,
  buildBidOptions,
  canAffordBid,
  getUnbuyableAvailableCount,
  canForceAssignPlayers,
  maybeApplyForcedAssignments,
  ROSTER_SLOTS,
} from '../src/asta-budget.js';
import { isAuctionComplete } from '../src/exportAstaPdf.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`  ✗ ${message}`);
    return;
  }
  passed += 1;
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

function makeCoach(id, name, budget = INITIAL_BUDGET, players = []) {
  return { id, name, budget, players, online: true };
}

function makePlayer(id, name, status = 'available', coachId = null) {
  return { id, name, role: 'G', status, coachId };
}

function makeState(overrides = {}) {
  return {
    currentPlayer: null,
    currentBid: 0,
    currentBidder: null,
    timer: 15,
    phase: 'idle',
    isRunning: false,
    coaches: [],
    players: [
      makePlayer(1, 'Player A'),
      makePlayer(2, 'Player B'),
      makePlayer(3, 'Player C'),
    ],
    log: [],
    stateVersion: 0,
    ...overrides,
  };
}

/** Simula handleStartSinglePlayer (banditore) */
function simulateStartSinglePlayer(state, playerId) {
  const player = findPlayerById(state.players, playerId);
  if (!player || player.status !== 'available') return { ok: false, state, reason: 'unavailable' };
  if (
    state.currentPlayer
    && samePlayerId(state.currentPlayer.id, player.id)
    && state.phase === 'live'
  ) {
    return { ok: true, state, reason: 'already-on-stage' };
  }
  const next = {
    ...state,
    currentPlayer: player,
    currentBid: 0,
    currentBidder: null,
    phase: 'live',
    isRunning: false,
    timer: 15,
    stateVersion: (state.stateVersion || 0) + 1,
  };
  return { ok: true, state: next };
}

/** Simula applyState con controllo versione */
function simulateApplyState(current, incoming) {
  const incomingVersion = incoming.stateVersion || 0;
  const currentVersion = current.stateVersion || 0;
  if (incomingVersion > 0) {
    if (incomingVersion <= currentVersion) return current;
  } else if (currentVersion > 0) {
    return current;
  }
  return incoming;
}

/** Simula publishState con updater (timer) */
function simulateTimerTick(state) {
  if (state.phase !== 'live' || !state.isRunning || !state.currentPlayer) return state;
  const nextTimer = Math.max(0, state.timer - 1);
  if (nextTimer === 0) return state;
  return {
    ...state,
    timer: nextTimer,
    stateVersion: (state.stateVersion || 0) + 1,
  };
}

/** Simula handleStartAuction (banditore → publish state) */
function simulateStartAuction(state) {
  if (state.phase === 'paused' && state.currentPlayer) {
    return {
      ...state,
      phase: 'live',
      isRunning: true,
      stateVersion: (state.stateVersion || 0) + 1,
    };
  }
  if (state.currentPlayer && state.phase === 'live' && !state.isRunning) {
    return {
      ...state,
      isRunning: true,
      timer: 15,
      currentBid: 0,
      currentBidder: null,
      stateVersion: (state.stateVersion || 0) + 1,
    };
  }
  const first = state.players.find((p) => p.status === 'available') ?? null;
  if (!first) return null;
  return {
    ...state,
    currentPlayer: first,
    currentBid: 0,
    currentBidder: null,
    phase: 'live',
    timer: 15,
    isRunning: true,
    stateVersion: (state.stateVersion || 0) + 1,
  };
}

/** Simula applyBid Ably (banditore riceve offerta cellulare) */
function simulateApplyBid(state, coachId, amount) {
  if (state.phase !== 'live' || !state.isRunning || !state.currentPlayer) return null;
  const coach = state.coaches.find((c) => c.id === coachId);
  if (!validateBidAmount(coach, amount, state.currentBid, 1).ok) return null;
  return {
    ...state,
    currentBid: amount,
    currentBidder: coachId,
    timer: 15,
    stateVersion: (state.stateVersion || 0) + 1,
  };
}

function isCoachLiveView(state) {
  return state.phase === 'live' && state.isRunning && Boolean(state.currentPlayer);
}

// ─── Test suite ───

section('ID giocatori (string vs number)');
assert(samePlayerId(1, '1'), 'samePlayerId 1 === "1"');
assert(samePlayerId('2', 2), 'samePlayerId "2" === 2');
assert(!samePlayerId(1, 2), 'samePlayerId diversi');
assert(findPlayerById([makePlayer(5, 'X')], '5')?.name === 'X', 'findPlayerById con string id');

section('Budget e offerte (300 crediti, 6 posti in rosa)');
const coachFullBudget = makeCoach(2, 'Coach A', 300);
assert(INITIAL_BUDGET === 300, 'INITIAL_BUDGET = 300');
assert(ROSTER_SLOTS === 6, '6 giocatori per allenatore (48÷8)');
assert(getPurchasedPlayerCount(coachFullBudget) === 0, '0 giocatori acquistati');
assert(getRemainingRosterSlots(coachFullBudget) === 6, '6 posti rimasti');
assert(getMaxBidAmount(coachFullBudget) === 295, 'maxOfferta = 300 - (6-1) = 295');

const coachReserveExample = makeCoach(4, 'Coach C', 3, [
  { id: 10, name: 'P', role: 'G', price: 297 },
  { id: 11, name: 'Q', role: 'G', price: 1 },
  { id: 12, name: 'R', role: 'G', price: 1 },
]);
assert(getRemainingRosterSlots(coachReserveExample) === 3, '3 posti rimasti con 3 acquistati');
assert(getMaxBidAmount(coachReserveExample) === 1, 'maxOfferta = 3 - (3-1) = 1');

const coachLow = makeCoach(3, 'Coach B', 3, [
  { id: 10, name: 'P', role: 'G', price: 290 },
  { id: 11, name: 'Q', role: 'G', price: 1 },
  { id: 12, name: 'R', role: 'G', price: 1 },
  { id: 13, name: 'S', role: 'G', price: 1 },
  { id: 14, name: 'T', role: 'G', price: 1 },
]);
assert(getRemainingRosterSlots(coachLow) === 1, '1 posto rimasto');
assert(getMaxBidAmount(coachLow) === 3, 'max bid = budget con 1 posto');
assert(canAffordBid(coachLow, 3), 'può offrire 3');
assert(!canAffordBid(coachLow, 4), 'non può offrire 4');

section('validateBidAmount (Ably / UI)');
{
  const coach = makeCoach(2, 'Coach A', 3, [
    { id: 1, name: 'A', role: 'G', price: 297 },
    { id: 2, name: 'B', role: 'G', price: 1 },
    { id: 3, name: 'C', role: 'G', price: 1 },
    { id: 4, name: 'D', role: 'G', price: 1 },
    { id: 5, name: 'E', role: 'G', price: 1 },
  ]);
  assert(validateBidAmount(coach, 3, 0, 1).ok, 'offerta al massimo consentito');
  assert(!validateBidAmount(coach, 4, 0, 1).ok, 'blocca oltre maxOfferta');
  assert(!validateBidAmount(coach, 1, 5, 1).ok, 'blocca sotto minimo rilancio');
  const mobile = buildMobileBidOptions(0, coachFullBudget);
  assert(mobile.options.every((o) => o.amount <= getMaxBidAmount(coachFullBudget)), 'mobile rispetta maxOfferta');
  const desktop = buildBidOptions(0, coachFullBudget);
  assert(desktop.options.every((o) => o.amount <= getMaxBidAmount(coachFullBudget)), 'desktop rispetta maxOfferta');
}

section('Pulsanti mobile (+1 +5 +10, no max)');
const mobileOpts = buildMobileBidOptions(10, coachFullBudget);
assert(mobileOpts.options.length === 3, 'mobile: 3 pulsanti');
assert(mobileOpts.options.every((o) => ['+1', '+5', '+10'].includes(o.label)), 'mobile: solo +1 +5 +10');
assert(!mobileOpts.options.some((o) => o.amount === getMaxBidAmount(coachFullBudget)), 'mobile: nessun pulsante max');

section('Metti in asta — scenari');
{
  let s = makeState();
  let r = simulateStartSinglePlayer(s, 2);
  assert(r.ok, 'metti in asta da idle');
  assert(r.state.currentPlayer?.name === 'Player B', 'giocatore B in palco');
  assert(r.state.phase === 'live' && !r.state.isRunning, 'fase live pronta');

  r = simulateStartSinglePlayer(r.state, '3');
  assert(r.ok, 'metti in asta con id stringa');
  assert(r.state.currentPlayer?.id === 3, 'giocatore C in palco');

  s = makeState({ phase: 'settled', currentPlayer: makePlayer(1, 'Player A'), isRunning: false });
  r = simulateStartSinglePlayer(s, 2);
  assert(r.ok, 'metti in asta durante settled (altro giocatore)');

  s = makeState({ isRunning: true, phase: 'live', currentPlayer: makePlayer(1, 'Player A') });
  r = simulateStartSinglePlayer(s, 2);
  assert(r.ok && r.state.currentPlayer?.id === 2, 'sostituisce giocatore anche con asta in corso');
  assert(!r.state.isRunning, 'metti in asta ferma il timer del precedente');

  r = simulateStartSinglePlayer(r.state, 2);
  assert(r.ok && r.reason === 'already-on-stage', 'stesso giocatore già in palco: nessun cambio');

  s = makeState({
    players: [makePlayer(1, 'A', 'assigned', 2), makePlayer(2, 'B')],
  });
  r = simulateStartSinglePlayer(s, 1);
  assert(!r.ok && r.reason === 'unavailable', 'bloccato se giocatore assegnato');
}

section('Race stateVersion (history/timer)');
{
  let current = makeState({ stateVersion: 5, currentPlayer: makePlayer(2, 'Player B'), phase: 'live' });
  const staleHistory = { ...makeState({ currentPlayer: null }), stateVersion: 3 };
  const afterHistory = simulateApplyState(current, staleHistory);
  assert(afterHistory.currentPlayer?.id === 2, 'history stale non sovrascrive');

  const legacyStale = { ...makeState({ currentPlayer: null }), stateVersion: 0 };
  const afterLegacy = simulateApplyState(current, legacyStale);
  assert(afterLegacy.currentPlayer?.id === 2, 'legacy stale ignorato se version > 0');

  const placed = simulateStartSinglePlayer(current, 3);
  assert(placed.ok, 'metti in asta dopo tick');
  const afterTick = simulateTimerTick(placed.state);
  assert(afterTick.currentPlayer?.id === 3, 'timer non rimuove giocatore in palco (non running)');
}

section('RIASTA');
{
  const coach = makeCoach(2, 'Coach A', 250, [{ id: 1, name: 'Player A', role: 'G', price: 50 }]);
  const s = makeState({
    phase: 'idle',
    players: [makePlayer(1, 'Player A', 'assigned', 2), makePlayer(2, 'Player B')],
    coaches: [coach],
  });
  const result = buildReAuctionPlayerState(s, '1');
  assert(result !== null, 'RIASTA ok');
  assert(result.price === 50, 'crediti restituiti 50');
  assert(result.state.coaches[0].budget === 300, 'budget ripristinato 300');
  assert(result.state.currentPlayer?.status === 'available', 'giocatore di nuovo libero');
  assert(result.state.phase === 'live' && !result.state.isRunning, 'in palco pronto');
  assert(buildReAuctionPlayerState(s, 99) === null, 'RIASTA fallisce id inesistente');
}

section('Restart asta (settled → riavvio stesso giocatore)');
{
  const coach = makeCoach(2, 'Coach A', 250, []);
  const s = makeState({
    phase: 'settled',
    currentPlayer: makePlayer(1, 'Player A', 'available'),
    currentBid: 50,
    currentBidder: 2,
    coaches: [coach],
    players: [makePlayer(1, 'Player A'), makePlayer(2, 'Player B')],
  });
  const restarted = buildRestartPlayerState(s);
  assert(restarted !== null, 'restart ok');
  assert(restarted.isRunning, 'restart avvia timer');
  assert(restarted.currentBid === 0, 'offerta azzerata');
  assert(restarted.coaches[0].budget === 300, 'crediti restituiti al riavvio');
}

section('Reset asta mantiene giocatori');
{
  const s = makeState({
    players: [makePlayer(1, 'A', 'assigned', 2), makePlayer(2, 'B', 'assigned', 2)],
    coaches: [makeCoach(2, 'Coach A', 200, [{ id: 1, name: 'A', role: 'G', price: 50 }])],
    phase: 'settled',
  });
  const reset = buildResetAuctionState(s);
  assert(reset.players.length >= 2, 'giocatori mantenuti (lista completa da storage)');
  assert(reset.players.every((p) => p.status === 'available'), 'tutti di nuovo liberi');
  assert(reset.coaches.length === 0, 'allenatori azzerati');
  assert(reset.phase === 'idle', 'fase idle');
}

section('Join allenatori');
{
  const { coaches, coachId, error } = joinCoachIntoState([], null, 'Mario', INITIAL_BUDGET);
  assert(!error, 'join senza errori');
  assert(coachId === 2, 'primo coach id 2 (1 = banditore)');
  assert(coaches[0].budget === 300, 'budget iniziale 300');
  const dup = joinCoachIntoState(coaches, null, 'Mario', INITIAL_BUDGET);
  assert(dup.error, 'nome duplicato rifiutato');
}

section('Banditore sessione');
assert(isBanditoreRole(BANDITORE_COACH_ID), 'id 1 = banditore');
assert(isBanditoreConsole(BANDITORE_COACH_ID, true), 'console con sessione verificata');
assert(!isBanditoreConsole(BANDITORE_COACH_ID, false), 'console senza sessione');

section('Asta completata');
{
  const allAssigned = [makePlayer(1, 'A', 'assigned'), makePlayer(2, 'B', 'assigned')];
  assert(isAuctionComplete(allAssigned, 'idle', false), 'completa se nessuno libero');
  assert(!isAuctionComplete(allAssigned, 'live', true), 'non completa se asta running');
  assert(!isAuctionComplete([makePlayer(1, 'A')], 'idle', false), 'non completa se liberi');
}

section('Assegnazione forzata');
{
  const brokeCoach = makeCoach(2, 'Coach A', 0);
  const reserveCoach = makeCoach(3, 'Coach B', 1, [
    { id: 10, name: 'P', role: 'G', price: 297 },
    { id: 11, name: 'Q', role: 'G', price: 1 },
    { id: 12, name: 'R', role: 'G', price: 1 },
  ]);
  const players = [makePlayer(20, 'Libero 1'), makePlayer(21, 'Libero 2')];
  assert(getUnbuyableAvailableCount(players, [brokeCoach]) === 2, '2 giocatori non comprabili');
  assert(!canForceAssignPlayers(players, [brokeCoach]), 'forza impossibile senza crediti');
  assert(getUnbuyableAvailableCount(players, [reserveCoach]) === 2, 'non comprabili con riserva budget');
  assert(canForceAssignPlayers(players, [reserveCoach]), 'forza possibile con riserva e crediti');
}

section('Demo setup e default 48 giocatori');
{
  assert(PLAYER_COUNT === 48, 'PLAYER_COUNT = 48');
  assert(COACH_COUNT === 8, 'COACH_COUNT = 8');
  assert(ROSTER_SLOTS === PLAYER_COUNT / COACH_COUNT, '48÷8 = 6 giocatori per allenatore');
  assert(getDemoSetup().players.length === DEMO_PLAYER_COUNT, 'demo: 16 giocatori');
  const defaults = getDefaultSetup();
  assert(defaults.players.length === 48, 'default: 48 giocatori');
  assert(defaults.players[0].name === 'Galavotti Alex', 'primo giocatore ufficiale');
  assert(defaults.players[47].name === 'Kevin Lulaj', 'ultimo giocatore ufficiale');
}

section('mergeOfficialRoster');
{
  const placeholders = Array.from({ length: 48 }, (_, i) => ({
    id: i + 1,
    name: `Giocatore ${i + 1}`,
    role: 'G',
    team: '—',
  }));
  const merged = mergeOfficialRoster(placeholders);
  assert(merged.length === 48, 'merge: 48 giocatori');
  assert(merged[0].name === 'Galavotti Alex', 'merge: sostituisce placeholder');
  assert(merged[47].name === 'Kevin Lulaj', 'merge: ultimo nome ufficiale');
}
section('buildRosterSlotList');
{
  const slots = buildRosterSlotList([{ id: 1, name: 'A', role: 'G', price: 10 }]);
  assert(slots.length === ROSTER_SLOTS, 'sempre 6 slot in rosa');
  assert(slots.filter((s) => s.filled).length === 1, '1 giocatore');
  assert(slots.filter((s) => !s.filled).length === ROSTER_SLOTS - 1, '5 slot vuoti');
}

section('syncPlayersFromStorage');
{
  const setup = getDefaultSetup();
  const state = {
    players: [{ id: 1, name: 'Old', role: 'G', status: 'assigned', coachId: 2 }],
    currentPlayer: { id: 1, name: 'Old', role: 'G' },
  };
  const synced = syncPlayersFromStorage(state);
  assert(synced.players.length === PLAYER_COUNT, 'sync ripristina tutti i giocatori salvati');
  assert(synced.players[0].status === 'assigned', 'sync mantiene assegnazione');
  assert(synced.players[0].name === setup.players[0].name, 'sync aggiorna nome da storage');
}

section('Payload rete Ably (foto giocatori)');
{
  const bigPhoto = `data:image/jpeg;base64,${'A'.repeat(50_000)}`;
  const players = Array.from({ length: PLAYER_COUNT }, (_, i) => ({
    id: i + 1,
    name: `Giocatore ${i + 1}`,
    role: 'G',
    team: '—',
    status: 'available',
    coachId: null,
    photo: bigPhoto,
  }));
  const state = makeState({
    players,
    currentPlayer: players[0],
    phase: 'live',
    isRunning: true,
    stateVersion: 5,
  });
  const net = toNetworkGameState(state);
  assert(net.players.every((p) => !p.photo), 'rete: rosa senza foto');
  assert(!net.currentPlayer?.photo, 'rete: nessuna foto sul giocatore in palco');
  const rawSize = JSON.stringify(state).length;
  const netSize = JSON.stringify(net).length;
  assert(rawSize > 500_000, 'stato locale con 48 foto è pesante');
  assert(netSize < 30_000, `payload rete compatto (${netSize} byte)`);
}

section('Sync PC → cellulare (avvio asta e offerte)');
{
  const coachA = makeCoach(2, 'Lillo', 300);
  let banditore = makeState({
    phase: 'live',
    isRunning: false,
    currentPlayer: makePlayer(1, 'Girelli Federico'),
    coaches: [coachA],
    stateVersion: 3,
  });

  const started = simulateStartAuction(banditore);
  assert(started?.isRunning, 'banditore avvia asta da palco pronto');
  assert(started.stateVersion === 4, 'publish incrementa stateVersion');

  let mobile = simulateApplyState(banditore, started);
  assert(isCoachLiveView(mobile), 'cellulare vede asta live dopo sync');
  assert(mobile.currentPlayer?.name === 'Girelli Federico', 'stesso giocatore in palco');

  const stale = simulateApplyState(mobile, { ...banditore, stateVersion: 2 });
  assert(isCoachLiveView(stale), 'history stale non ferma asta sul cellulare');

  const afterTick = simulateApplyState(mobile, simulateTimerTick(started));
  assert(afterTick.timer === 14, 'timer sincronizzato sul cellulare');
  assert(isCoachLiveView(afterTick), 'timer non disattiva asta live');

  const bidState = simulateApplyBid(afterTick, 2, 6);
  assert(bidState?.currentBid === 6, 'offerta cellulare applicata sul banditore');
  assert(bidState?.currentBidder === 2, 'allenatore in testa aggiornato');

  const mobileBid = simulateApplyState(afterTick, bidState);
  assert(mobileBid.currentBid === 6, 'cellulare riceve offerta aggiornata');
  assert(mobileBid.currentBidder === 2, 'cellulare vede chi è in testa');

  const mobileOpts = buildMobileBidOptions(6, coachA);
  assert(mobileOpts.options.length === 3, 'pulsanti offerta visibili dopo avvio');
  assert(mobileOpts.options.every((o) => o.amount <= getMaxBidAmount(coachA)), 'pulsanti rispettano budget');

  const fromIdle = simulateStartAuction(makeState({ coaches: [coachA], stateVersion: 0 }));
  assert(fromIdle?.isRunning && fromIdle.currentPlayer?.id === 1, 'avvio da idle seleziona primo libero');
}

section('Disconnect coach');
{
  const coach = makeCoach(2, 'Coach A', 200, [{ id: 1, name: 'A', role: 'G', price: 50 }]);
  const s = makeState({
    players: [makePlayer(1, 'A', 'assigned', 2)],
    coaches: [coach],
    currentBidder: 2,
    currentBid: 10,
  });
  const next = disconnectCoachFromState(s, 2);
  assert(next.players[0].status === 'available', 'giocatore liberato');
  assert(next.currentBidder === null, 'offerta azzerata');
}

console.log('\n' + '─'.repeat(40));
console.log(`Risultato: ${passed} passati, ${failed} falliti`);
if (failed > 0) {
  process.exit(1);
}
console.log('✓ Tutti i test logici superati\n');
