/*
 * Ably Realtime — sincronizzazione multi-device
 *
 * Chiave API gratuita:
 *   1. Vai su https://ably.com e crea un account free
 *   2. Dashboard → la tua app → API Keys → copia la chiave
 *   3. Incollala in .env come VITE_ABLY_KEY=xxx
 *
 * Canale: asta-${stanzaCode}  (es. asta-TORNEO2025)
 * Eventi:
 *   state — gameState completo (pubblicato solo dal banditore)
 *   bid       — { coachId, amount } (pubblicato dagli allenatori)
 *   join      — { requestId, name, coachId? } (cellulare → banditore)
 *   join-ack  — { requestId, coachId } | { requestId, error }
 *   leave     — { coachId } (allenatore esce volontariamente)
 *
 * gameState:
 * { currentPlayer, currentBid, currentBidder, timer, coaches, players,
 *   isRunning, phase, log }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createAblyClient, getChannelName, isAblyConfigured } from './ably.js';
import { AstaTorneoLocal } from './asta-torneo-local.jsx';
import {
  buildInitialPlayers,
  AUCTION_SECONDS,
  saveSetup,
  loadSetup,
  mergeSetupIntoPlayers,
  getDemoSetup,
  RESET_ASTA_CONFIRM,
  INITIAL_BUDGET,
  BANDITORE_COACH_ID,
  BANDITORE_KEY,
  isBanditoreRole,
  isBanditoreConsole,
  joinCoachIntoState,
  upsertSavedCoach,
  addSetupPlayer,
  createJoinRequestId,
  isMobileDevice,
  getCoachDisplayName,
} from './asta-setup.js';
import { buildRestartPlayerState, buildResetAuctionState, buildReAuctionPlayerState, disconnectCoachFromState } from './asta-logic.js';
import { isAuctionComplete } from './exportAstaPdf.js';
import { canAffordBid, applyForcedRosterAssignments, getUnbuyableAvailableCount, canForceAssignPlayers, maybeApplyForcedAssignments } from './asta-budget.js';
import {
  AuctionUI,
  BanditoreEntryScreen,
  CoachEntryScreen,
  FinalResultsScreen,
  CoachMobileUI,
  CoachJoinPending,
  SetupScreen,
} from './asta-ui.jsx';

const JOIN_MAX_ATTEMPTS = 25;
const JOIN_RETRY_MS = 2000;
const COACH_EXIT_CONFIRM = 'Se esci non potrai rientrare con lo stesso profilo.\n\nDovrai entrare di nuovo come nuovo allenatore.\n\nConfermi l\'uscita?';

function parseSavedCoachId(saved) {
  if (!saved) return null;
  if (saved === BANDITORE_KEY) return BANDITORE_COACH_ID;
  const parsed = Number(saved);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildInitialState() {
  return {
    currentPlayer: null,
    currentBid: 0,
    currentBidder: null,
    timer: AUCTION_SECONDS,
    phase: 'idle',
    isRunning: false,
    coaches: [],
    players: buildInitialPlayers(),
    log: [{ text: 'Asta pronta. Aggiungi giocatori dal Setup o carica la demo.', timestamp: Date.now() }],
  };
}

const COACH_STORAGE_KEY = 'asta_coach_id';
const STANZA_STORAGE_KEY = 'asta_stanza_code';
const BANDITORE_SESSION_KEY = 'asta_banditore_verified';
const BID_INCREMENT = 1;

function sanitizeGameState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const players = Array.isArray(raw.players)
    ? raw.players.filter((p) => p && typeof p === 'object' && Number.isFinite(Number(p.id)))
    : [];
  const coaches = Array.isArray(raw.coaches)
    ? raw.coaches.filter((c) => c && typeof c === 'object' && Number.isFinite(Number(c.id)))
    : [];
  return {
    currentPlayer: raw.currentPlayer && typeof raw.currentPlayer === 'object'
      ? raw.currentPlayer
      : null,
    currentBid: typeof raw.currentBid === 'number' ? raw.currentBid : 0,
    currentBidder: raw.currentBidder ?? null,
    timer: typeof raw.timer === 'number' ? raw.timer : AUCTION_SECONDS,
    phase: raw.phase === 'live' || raw.phase === 'settled' || raw.phase === 'paused'
      ? raw.phase
      : 'idle',
    isRunning: Boolean(raw.isRunning),
    coaches,
    players,
    log: Array.isArray(raw.log) ? raw.log.filter((e) => e && typeof e.text === 'string') : [],
  };
}

function appendLog(state, text) {
  return { ...state, log: [...state.log, { text, timestamp: Date.now() }].slice(-100) };
}

function applyBid(state, coachId, amount) {
  if (state.phase !== 'live' || !state.isRunning || !state.currentPlayer) return null;
  const minBid = Math.max(state.currentBid + BID_INCREMENT, 1);
  if (amount < minBid) return null;
  const coach = state.coaches.find((c) => c.id === coachId);
  if (!coach || !canAffordBid(coach, amount)) return null;
  return {
    ...state,
    currentBid: amount,
    currentBidder: coachId,
    timer: AUCTION_SECONDS,
  };
}

export default function AstaTorneo() {
  if (!isAblyConfigured) {
    return <AstaTorneoLocal />;
  }
  return <AstaTorneoAbly />;
}

function isBanditoreSessionVerified() {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(BANDITORE_SESSION_KEY) === '1';
}

function shouldShowRoomEntry() {
  const savedCoach = localStorage.getItem(COACH_STORAGE_KEY);
  const savedStanza = localStorage.getItem(STANZA_STORAGE_KEY);
  if (!savedStanza || !savedCoach) return true;
  if (isBanditoreRole(parseSavedCoachId(savedCoach))) {
    return !isBanditoreSessionVerified();
  }
  return false;
}

function AstaTorneoAbly() {
  const [coachId, setCoachId] = useState(() => {
    if (!isBanditoreSessionVerified() && isBanditoreRole(parseSavedCoachId(localStorage.getItem(COACH_STORAGE_KEY)))) {
      return null;
    }
    return parseSavedCoachId(localStorage.getItem(COACH_STORAGE_KEY));
  });
  const [stanzaCode, setStanzaCode] = useState(() => localStorage.getItem(STANZA_STORAGE_KEY) ?? '');
  const [showRoomEntry, setShowRoomEntry] = useState(shouldShowRoomEntry);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [joinError, setJoinError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [connected, setConnected] = useState(false);
  const [offline, setOffline] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [auctioneerStale, setAuctioneerStale] = useState(false);
  const [bidError, setBidError] = useState('');
  const [actionError, setActionError] = useState('');
  const [resultsDismissed, setResultsDismissed] = useState(false);

  const [gameState, setGameState] = useState(buildInitialState);
  const gameStateRef = useRef(buildInitialState());
  const ablyRef = useRef(null);
  const channelRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const assignLockRef = useRef(false);
  const isAuctioneerRef = useRef(false);
  const pendingJoinRef = useRef(null);
  const joinAttemptsRef = useRef(0);
  const coachRegisteredRef = useRef(false);
  const lastStateAtRef = useRef(Date.now());

  const isAuctioneer = isBanditoreConsole(coachId, isBanditoreSessionVerified());
  isAuctioneerRef.current = isAuctioneer;
  pendingJoinRef.current = pendingJoin;

  const {
    currentPlayer, currentBid, currentBidder, timer, phase,
    isRunning, coaches, players, log,
  } = gameState;

  gameStateRef.current = gameState;

  useEffect(() => {
    if (!isAuctionComplete(players, phase, isRunning)) {
      setResultsDismissed(false);
    }
  }, [players, phase, isRunning]);

  const applyState = useCallback((data) => {
    const sanitized = sanitizeGameState(data);
    if (!sanitized) return;
    lastStateAtRef.current = Date.now();
    setAuctioneerStale(false);
    gameStateRef.current = sanitized;
    setGameState(sanitized);
  }, []);

  const publishState = useCallback((next) => {
    lastStateAtRef.current = Date.now();
    gameStateRef.current = next;
    setGameState(next);
    channelRef.current?.publish('state', next).catch((err) => {
      console.error('publish state error:', err);
    });
  }, []);

  // Connessione Ably + subscribe
  useEffect(() => {
    if (showRoomEntry || !stanzaCode) return undefined;

    const ably = createAblyClient();
    if (!ably) {
      setJoinError('Connessione non disponibile. Controlla la configurazione Ably.');
      return undefined;
    }
    ablyRef.current = ably;
    const channel = ably.channels.get(getChannelName(stanzaCode));
    channelRef.current = channel;

    const onConnected = () => {
      setConnected(true);
      setOffline(false);
      setConnectionError('');
    };
    const onDisconnected = () => {
      setConnected(false);
      setOffline(true);
    };
    const onConnecting = () => setOffline(true);
    const onFailed = () => {
      setConnected(false);
      setOffline(true);
      setConnectionError(
        'Impossibile connettersi ad Ably. Verifica VITE_ABLY_KEY, rete e che la stanza sia corretta.',
      );
    };

    ably.connection.on('connected', onConnected);
    ably.connection.on('disconnected', onDisconnected);
    ably.connection.on('connecting', onConnecting);
    ably.connection.on('failed', onFailed);

    if (ably.connection.state === 'connected') onConnected();

    const onState = (msg) => {
      if (!msg?.data) return;
      if (!isAuctioneerRef.current) applyState(msg.data);
    };

    channel.subscribe('state', onState);

    const onBid = (msg) => {
      if (!isAuctioneerRef.current || !msg?.data) return;
      const { coachId: bidderId, amount } = msg.data;
      if (!bidderId || typeof amount !== 'number') return;
      const next = applyBid(gameStateRef.current, bidderId, amount);
      if (next) publishState(next);
    };

    const onJoinRequest = (msg) => {
      if (!isAuctioneerRef.current || !msg?.data) return;
      const { requestId, name, coachId: requestedId } = msg.data;
      if (!requestId || !name?.trim()) return;

      const state = gameStateRef.current;
      const trimmedName = name.trim();
      const result = joinCoachIntoState(
        state.coaches,
        null,
        trimmedName,
        INITIAL_BUDGET,
      );
      if (result.error) {
        channel.publish('join-ack', { requestId, error: result.error }).catch(console.error);
        return;
      }
      publishState(appendLog({ ...state, coaches: result.coaches }, `${trimmedName} si è unito all'asta`));
      const joined = result.coaches.find((c) => c.id === result.coachId);
      if (joined) upsertSavedCoach(joined);
      channel.publish('join-ack', { requestId, coachId: result.coachId }).catch(console.error);
    };

    const onLeaveRequest = (msg) => {
      if (!isAuctioneerRef.current || !msg?.data?.coachId) return;
      const id = msg.data.coachId;
      const state = gameStateRef.current;
      const coach = state.coaches.find((c) => c.id === id);
      if (!coach) return;
      const next = {
        ...state,
        coaches: state.coaches.map((c) => (c.id === id ? { ...c, online: false } : c)),
      };
      publishState(appendLog(next, `${coach.name} si è disconnesso`));
    };

    if (isAuctioneer) {
      channel.subscribe('bid', onBid);
      channel.subscribe('join', onJoinRequest);
      channel.subscribe('leave', onLeaveRequest);
    }

    channel.history({ limit: 10 }).then((result) => {
      const lastState = result.items.find((m) => m.name === 'state');
      if (lastState?.data) {
        applyState(lastState.data);
      } else if (isAuctioneerRef.current) {
        publishState(buildInitialState());
      }
    }).catch(console.error);

    return () => {
      channel.unsubscribe('state', onState);
      channel.unsubscribe('bid', onBid);
      channel.unsubscribe('join', onJoinRequest);
      channel.unsubscribe('leave', onLeaveRequest);
      ably.connection.off('connected', onConnected);
      ably.connection.off('disconnected', onDisconnected);
      ably.connection.off('connecting', onConnecting);
      ably.connection.off('failed', onFailed);
      ably.close();
      ablyRef.current = null;
      channelRef.current = null;
    };
  }, [stanzaCode, showRoomEntry, isAuctioneer, applyState, publishState]);

  useEffect(() => {
    if (isAuctioneer || showRoomEntry || !coachId) {
      setAuctioneerStale(false);
      return undefined;
    }

    const check = () => {
      const { phase: ph, isRunning: running } = gameStateRef.current;
      if (ph === 'live' && running && Date.now() - lastStateAtRef.current > 8000) {
        setAuctioneerStale(true);
      } else {
        setAuctioneerStale(false);
      }
    };

    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [isAuctioneer, showRoomEntry, coachId, phase, isRunning]);

  const completeJoin = useCallback((id, requestId) => {
    if (pendingJoinRef.current?.requestId !== requestId) return;
    localStorage.setItem(COACH_STORAGE_KEY, String(id));
    setCoachId(id);
    setPendingJoin(null);
    setJoinError('');
    joinAttemptsRef.current = 0;
  }, []);

  const leaveRoomAsCoach = useCallback((clearStorage = true) => {
    if (clearStorage) {
      localStorage.removeItem(COACH_STORAGE_KEY);
      localStorage.removeItem(STANZA_STORAGE_KEY);
    }
    coachRegisteredRef.current = false;
    setCoachId(null);
    setStanzaCode('');
    setPendingJoin(null);
    setJoinError('');
    setShowRoomEntry(true);
  }, []);

  const leaveAsCoachWithConfirm = useCallback(() => {
    if (!coachId || isAuctioneer) return;
    if (!window.confirm(COACH_EXIT_CONFIRM)) return;
    channelRef.current?.publish('leave', { coachId }).catch(console.error);
    leaveRoomAsCoach();
  }, [coachId, isAuctioneer, leaveRoomAsCoach]);

  useEffect(() => {
    if (!pendingJoin || coachId) return undefined;

    const pending = pendingJoin;
    let cancelled = false;
    let retryTimer = null;
    let waitTimer = null;

    const onJoinAck = (msg) => {
      if (cancelled || !msg?.data || msg.data.requestId !== pending.requestId) return;
      if (msg.data.error) {
        setJoinError(msg.data.error);
        return;
      }
      if (msg.data.coachId) completeJoin(msg.data.coachId, pending.requestId);
    };

    const publishJoin = () => {
      const channel = channelRef.current;
      const currentPending = pendingJoinRef.current;
      if (cancelled || !channel || !currentPending || currentPending.requestId !== pending.requestId) return;

      joinAttemptsRef.current += 1;
      channel.publish('join', {
        requestId: currentPending.requestId,
        name: currentPending.name,
      }).catch((err) => {
        console.error('join publish error:', err);
      });

      if (joinAttemptsRef.current >= JOIN_MAX_ATTEMPTS) {
        setJoinError('Banditore non raggiungibile. Assicurati che il banditore abbia aperto la stanza.');
      }
    };

    const attachJoin = () => {
      const channel = channelRef.current;
      if (!channel || cancelled) return;
      channel.subscribe('join-ack', onJoinAck);
      publishJoin();
      retryTimer = setInterval(publishJoin, JOIN_RETRY_MS);
    };

    if (channelRef.current) {
      attachJoin();
    } else {
      waitTimer = setInterval(() => {
        if (channelRef.current) {
          clearInterval(waitTimer);
          attachJoin();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (waitTimer) clearInterval(waitTimer);
      if (retryTimer) clearInterval(retryTimer);
      channelRef.current?.unsubscribe('join-ack', onJoinAck);
    };
  }, [pendingJoin, coachId, completeJoin]);

  useEffect(() => {
    if (!pendingJoin || coachId) return;
    const trimmed = pendingJoin.name.trim();
    const match = coaches.find((c) => c.online && c.name.trim() === trimmed);
    if (match) completeJoin(match.id, pendingJoin.requestId);
  }, [coaches, pendingJoin, coachId, completeJoin]);

  useEffect(() => {
    if (isAuctioneer || !coachId) {
      coachRegisteredRef.current = false;
      return;
    }
    const myCoach = coaches.find((c) => c.id === coachId);
    if (myCoach?.online) {
      coachRegisteredRef.current = true;
      return;
    }
    if (coachRegisteredRef.current) {
      coachRegisteredRef.current = false;
      alert('Sei stato rimosso dall\'asta dal banditore.');
      leaveRoomAsCoach(false);
    }
  }, [coaches, coachId, isAuctioneer, leaveRoomAsCoach]);

  const handleAssign = useCallback(() => {
    if (!isAuctioneer || assignLockRef.current) return;
    assignLockRef.current = true;

    const state = gameStateRef.current;
    const { currentBid: bid, currentBidder: bidder, currentPlayer: player, coaches: cs, players: ps, phase: ph } = state;

    if (!player || ph === 'settled') {
      assignLockRef.current = false;
      return;
    }

    const updatedPlayers = ps.map((p) =>
      p.id === player.id ? { ...p, status: 'assigned', coachId: bidder ?? null } : p,
    );

    let updatedCoaches = cs;
    let logText = '';

    if (bidder && bid > 0) {
      updatedCoaches = cs.map((c) => {
        if (c.id !== bidder) return c;
        return {
          ...c,
          budget: c.budget - bid,
          players: [...c.players, { id: player.id, name: player.name, role: player.role, price: bid }],
        };
      });
      const winner = cs.find((c) => c.id === bidder);
      logText = `${player.name} assegnato a ${winner?.name ?? 'Allenatore'} per ${bid} cr.`;
    } else {
      logText = `${player.name} non venduto (nessuna offerta).`;
    }

    let next = { ...state, players: updatedPlayers, coaches: updatedCoaches, phase: 'settled', isRunning: false, timer: 0, currentPlayer: player };
    next = appendLog(next, logText);
    publishState(next);
    assignLockRef.current = false;
  }, [isAuctioneer, publishState]);

  const advanceToNextPlayer = useCallback(() => {
    if (!isAuctioneer) return;
    let snapshot = gameStateRef.current;
    const { state: forcedState, logLines } = maybeApplyForcedAssignments(snapshot);
    if (logLines.length > 0) {
      snapshot = logLines.reduce((s, text) => appendLog(s, text), forcedState);
    }

    const ps = snapshot.players;
    const next = ps.find((p) => p.status === 'available') ?? null;
    let state = {
      ...snapshot,
      phase: next ? 'live' : 'idle',
      currentPlayer: next,
      currentBid: 0,
      currentBidder: null,
      timer: AUCTION_SECONDS,
      isRunning: Boolean(next),
    };
    if (next) state = appendLog(state, `Prossimo giocatore: ${next.name}`);
    publishState(state);
  }, [isAuctioneer, publishState]);

  // Timer asta — solo banditore
  useEffect(() => {
    if (!isAuctioneer || phase !== 'live' || !isRunning || !currentPlayer) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return undefined;
    }

    timerIntervalRef.current = setInterval(() => {
      const state = gameStateRef.current;
      const next = Math.max(0, state.timer - 1);
      if (next === 0) {
        clearInterval(timerIntervalRef.current);
        handleAssign();
        return;
      }
      publishState({ ...state, timer: next });
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [isAuctioneer, phase, isRunning, currentPlayer?.id, handleAssign, publishState]);

  const handleConfirmNext = () => {
    if (!isAuctioneer || phase !== 'settled') return;
    advanceToNextPlayer();
  };

  const handleRestartPlayer = () => {
    if (!isAuctioneer || phase !== 'settled' || !gameStateRef.current.currentPlayer) return;
    let next = buildRestartPlayerState(gameStateRef.current);
    if (!next) return;
    next = appendLog(next, `Asta riavviata: ${next.currentPlayer.name}`);
    publishState(next);
  };

  const joinRoom = ({ stanza, name, role }) => {
    const normalized = stanza.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!normalized || !trimmedName) return;

    localStorage.setItem(STANZA_STORAGE_KEY, normalized);
    setStanzaCode(normalized);
    setShowRoomEntry(false);
    setBidError('');
    setActionError('');
    setJoinError('');

    if (role === 'banditore') {
      sessionStorage.setItem(BANDITORE_SESSION_KEY, '1');
      localStorage.setItem(COACH_STORAGE_KEY, String(BANDITORE_COACH_ID));
      setCoachId(BANDITORE_COACH_ID);
      setPendingJoin(null);
      return;
    }

    localStorage.removeItem(COACH_STORAGE_KEY);
    setCoachId(null);
    joinAttemptsRef.current = 0;
    setPendingJoin({
      requestId: createJoinRequestId(),
      name: trimmedName,
    });
  };

  const cancelPendingJoin = () => {
    setPendingJoin(null);
    setJoinError('');
    setShowRoomEntry(true);
  };

  const retryPendingJoin = () => {
    if (!pendingJoin) return;
    joinAttemptsRef.current = 0;
    setJoinError('');
    setPendingJoin({
      ...pendingJoin,
      requestId: createJoinRequestId(),
    });
  };

  const leaveRoom = () => {
    if (isAuctioneer) {
      sessionStorage.removeItem(BANDITORE_SESSION_KEY);
      localStorage.removeItem(COACH_STORAGE_KEY);
      localStorage.removeItem(STANZA_STORAGE_KEY);
      setCoachId(null);
      setStanzaCode('');
      setPendingJoin(null);
      setJoinError('');
      setShowRoomEntry(true);
      setGameState(buildInitialState());
      return;
    }
    leaveAsCoachWithConfirm();
  };

  const handleRemoveCoach = useCallback((targetCoachId) => {
    if (!isAuctioneer || targetCoachId === BANDITORE_COACH_ID) return;
    const state = gameStateRef.current;
    const coach = state.coaches.find((c) => c.id === targetCoachId);
    if (!coach) return;
    if (!window.confirm(`Rimuovere ${coach.name} dall'asta?\n\nI suoi giocatori torneranno disponibili.`)) return;
    const next = disconnectCoachFromState(state, targetCoachId, INITIAL_BUDGET);
    publishState(appendLog(next, `${coach.name} rimosso dal banditore`));
  }, [isAuctioneer, publishState]);

  const handleInitSetup = () => {
    if (!isAuctioneer) return;
    if (!window.confirm(RESET_ASTA_CONFIRM)) return;
    publishState({
      ...buildResetAuctionState(gameStateRef.current),
      log: [{ text: 'Asta resettata. Giocatori mantenuti.', timestamp: Date.now() }],
    });
    setActionError('');
  };

  const handleLoadDemo = () => {
    if (!isAuctioneer) return;
    const demo = getDemoSetup();
    saveSetup(demo);
    const state = gameStateRef.current;
    publishState(appendLog(
      { ...state, players: mergeSetupIntoPlayers([], demo.players) },
      'Dati demo caricati (16 giocatori).',
    ));
    setActionError('');
  };

  const handleSetupSave = (draft) => {
    saveSetup(draft);
    const state = gameStateRef.current;
    const next = {
      ...state,
      players: mergeSetupIntoPlayers(state.players, draft.players),
    };
    publishState(appendLog(next, 'Configurazione aggiornata.'));
    setShowSetup(false);
  };

  const handleAddPlayer = (fields) => {
    if (!isAuctioneer) return;
    const name = fields?.name?.trim();
    if (!name) return;
    const setup = loadSetup();
    const { setupPlayers, gamePlayer } = addSetupPlayer(setup.players, {
      name,
      role: fields.role,
      team: fields.team,
    });
    saveSetup({ players: setupPlayers });
    const state = gameStateRef.current;
    publishState(appendLog(
      { ...state, players: [...state.players, gamePlayer] },
      `Aggiunto ${gamePlayer.name}`,
    ));
  };

  const handleUpdatePlayer = (id, field, value) => {
    if (!isAuctioneer) return;
    const setup = loadSetup();
    const setupPlayers = setup.players.map((p) => (p.id === id ? { ...p, [field]: value } : p));
    saveSetup({ players: setupPlayers });
    const state = gameStateRef.current;
    const players = state.players.map((p) => {
      if (p.id !== id) return p;
      return { ...p, [field]: value };
    });
    publishState({ ...state, players });
  };

  const handleRemovePlayer = (id) => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;
    const target = state.players.find((p) => p.id === id);
    if (!target || target.status === 'assigned') return;
    if (state.players.length <= 1) return;

    const setup = loadSetup();
    saveSetup({ players: setup.players.filter((p) => p.id !== id) });
    publishState(appendLog(
      { ...state, players: state.players.filter((p) => p.id !== id) },
      `Rimosso ${target.name}`,
    ));
  };

  const handleStartAuction = () => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;

    if (state.phase === 'paused' && state.currentPlayer) {
      publishState(appendLog({ ...state, phase: 'live', isRunning: true }, 'Asta ripresa.'));
      setActionError('');
      return;
    }

    if (state.currentPlayer && state.phase === 'live' && !state.isRunning) {
      publishState(appendLog({
        ...state,
        isRunning: true,
        timer: AUCTION_SECONDS,
        currentBid: 0,
        currentBidder: null,
      }, `Asta avviata: ${state.currentPlayer.name}`));
      setActionError('');
      return;
    }

    const first = state.players.filter((p) => p.status === 'available')[0] ?? null;
    if (!first) {
      setActionError('Nessun giocatore disponibile.');
      return;
    }
    let nextState = {
      ...gameStateRef.current,
      currentPlayer: first,
      currentBid: 0,
      currentBidder: null,
      phase: 'live',
      timer: AUCTION_SECONDS,
      isRunning: true,
    };
    nextState = appendLog(nextState, `Asta avviata: ${first.name}`);
    publishState(nextState);
    setActionError('');
  };

  const handleStartSinglePlayer = useCallback((playerId) => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;
    if (state.isRunning) return;
    if (state.phase === 'settled') return;
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.status !== 'available') return;
    let next = {
      ...state,
      currentPlayer: player,
      currentBid: 0,
      currentBidder: null,
      phase: 'live',
      isRunning: false,
      timer: AUCTION_SECONDS,
    };
    next = appendLog(next, `${player.name} in palco — pronto per l'asta`);
    publishState(next);
    setActionError('');
  }, [isAuctioneer, publishState]);

  const handleReAuctionPlayer = useCallback((playerId) => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;
    if (state.phase === 'settled') {
      setActionError('Conferma l\'asta in corso prima di avviare una riasta.');
      return;
    }
    const result = buildReAuctionPlayerState(state, playerId);
    if (!result) return;
    const { state: next, price, coach } = result;
    publishState(appendLog(
      next,
      `${next.currentPlayer.name} rimesso in asta — ${getCoachDisplayName(coach)} ha riavuto ${price} cr.`,
    ));
    setActionError('');
  }, [isAuctioneer, publishState]);

  const handleForceAssignAll = useCallback(() => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;
    const count = getUnbuyableAvailableCount(state.players, state.coaches);
    if (count === 0) return;
    if (!canForceAssignPlayers(state.players, state.coaches)) {
      setActionError('Nessun allenatore ha crediti e posti liberi per l\'assegnazione forzata.');
      return;
    }
    if (!window.confirm(
      `Assegnare i giocatori rimanenti (${count}) a 1 credito ciascuno, in ordine casuale?`,
    )) return;

    const snapshot = {
      ...state,
      isRunning: false,
      phase: 'idle',
      currentPlayer: null,
      currentBid: 0,
      currentBidder: null,
      timer: AUCTION_SECONDS,
    };
    const { state: forcedState, logLines } = applyForcedRosterAssignments(snapshot);
    if (logLines.length === 0) {
      setActionError('Nessuna assegnazione possibile.');
      return;
    }
    const next = appendLog(
      logLines.reduce((s, text) => appendLog(s, text), forcedState),
      `Assegnazione forzata completata (${logLines.length} giocatore/i a 1 cr.).`,
    );
    publishState(next);
    setActionError('');
  }, [isAuctioneer, publishState]);

  const handleReassignPlayer = useCallback((playerId, newCoachId) => {
    if (!isAuctioneer) return;
    const state = gameStateRef.current;
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.status !== 'assigned' || !player.coachId) return;

    const oldCoachId = player.coachId;
    if (oldCoachId === newCoachId) return;

    const oldCoach = state.coaches.find((c) => c.id === oldCoachId);
    const newCoach = state.coaches.find((c) => c.id === newCoachId);
    if (!oldCoach || !newCoach) return;

    const rosterEntry = oldCoach.players.find((rp) => rp.id === playerId);
    const price = rosterEntry?.price ?? 0;
    if (newCoach.budget < price) {
      setActionError('Budget insufficiente per riassegnare questo giocatore.');
      return;
    }

    const updatedPlayers = state.players.map((p) => (
      p.id === playerId ? { ...p, coachId: newCoachId } : p
    ));
    const updatedCoaches = state.coaches.map((c) => {
      if (c.id === oldCoachId) {
        return {
          ...c,
          budget: c.budget + price,
          players: c.players.filter((rp) => rp.id !== playerId),
        };
      }
      if (c.id === newCoachId) {
        return {
          ...c,
          budget: c.budget - price,
          players: [...c.players, { id: player.id, name: player.name, role: player.role, price }],
        };
      }
      return c;
    });

    publishState(appendLog(
      { ...state, players: updatedPlayers, coaches: updatedCoaches },
      `${player.name} riassegnato da ${getCoachDisplayName(oldCoach)} a ${getCoachDisplayName(newCoach)} (${price} cr.)`,
    ));
    setActionError('');
  }, [isAuctioneer, publishState]);

  const handleStopAuction = () => {
    if (!isAuctioneer) return;
    publishState(appendLog({
      ...gameStateRef.current,
      isRunning: false,
      phase: 'paused',
    }, 'Asta in pausa.'));
  };

  const handleNextPlayer = () => {
    if (!isAuctioneer) return;
    if (phase === 'settled') {
      handleConfirmNext();
      return;
    }

    let snapshot = gameStateRef.current;
    const { state: forcedState, logLines } = maybeApplyForcedAssignments(snapshot);
    let state = logLines.reduce((s, text) => appendLog(s, text), forcedState);

    const available = state.players.filter((p) => p.status === 'available');
    const next = available.find((p) => p.id !== state.currentPlayer?.id) ?? available[0] ?? null;
    state = {
      ...state,
      currentPlayer: next,
      currentBid: 0,
      currentBidder: null,
      phase: next ? 'live' : 'idle',
      timer: AUCTION_SECONDS,
      isRunning: Boolean(next),
    };
    if (next) state = appendLog(state, `Prossimo giocatore: ${next.name}`);
    publishState(state);
  };

  const handleBid = (amount) => {
    if (isAuctioneer || !coachId) return;
    if (phase !== 'live' || !isRunning || !currentPlayer) {
      setBidError('Nessuna asta attiva.');
      return;
    }
    const coach = coaches.find((c) => c.id === coachId);
    if (!coach || !canAffordBid(coach, amount)) {
      setBidError('Riserva budget insufficiente per completare la rosa.');
      return;
    }
    const minBid = Math.max(currentBid + BID_INCREMENT, 1);
    if (amount < minBid) {
      setBidError('Offerta troppo bassa.');
      return;
    }
    setBidError('');
    channelRef.current?.publish('bid', { coachId, amount }).catch(() => {
      setBidError('Offerta non registrata, riprova.');
    });
  };

  if (showRoomEntry) {
    if (isMobileDevice()) {
      return (
        <CoachEntryScreen
          defaultStanza={stanzaCode}
          onJoin={joinRoom}
        />
      );
    }
    return (
      <BanditoreEntryScreen
        defaultStanza={stanzaCode}
        onJoin={joinRoom}
      />
    );
  }

  if (pendingJoin && !coachId) {
    return (
      <CoachJoinPending
        name={pendingJoin.name}
        error={joinError}
        hint="Il banditore deve entrare per primo e aprire la stanza."
        onBack={cancelPendingJoin}
        onRetry={joinError ? retryPendingJoin : undefined}
      />
    );
  }

  if (showSetup && isAuctioneer) {
    return (
      <SetupScreen
        onSave={handleSetupSave}
        onClose={() => setShowSetup(false)}
        stanzaCode={stanzaCode}
        gamePlayers={players}
      />
    );
  }

  if (coachId && isAuctionComplete(players, phase, isRunning) && !resultsDismissed) {
    return (
      <FinalResultsScreen
        stanzaCode={stanzaCode}
        coaches={coaches}
        log={log}
        onClose={() => setResultsDismissed(true)}
        onChangeCoach={isAuctioneer ? leaveRoom : leaveAsCoachWithConfirm}
      />
    );
  }

  const sharedProps = {
    coachId,
    onChangeCoach: isAuctioneer ? leaveRoom : leaveAsCoachWithConfirm,
    connected,
    connectedLabel: connected ? `Live · ${stanzaCode}` : 'Disconnesso',
    currentPlayer,
    currentBid,
    currentBidder,
    timer,
    phase,
    isRunning,
    coaches,
    bidError,
    onBid: handleBid,
  };

  if (!isAuctioneer) {
    return (
      <>
        {(connectionError || offline) && (
          <div className="offline-banner">
            {connectionError || 'Connessione persa — riconnessione in corso…'}
          </div>
        )}
        {auctioneerStale && !connectionError && (
          <div className="offline-banner stale-banner">
            Il banditore potrebbe essersi disconnesso — l&apos;asta è temporaneamente bloccata.
          </div>
        )}
        <CoachMobileUI {...sharedProps} auctioneerStale={auctioneerStale} />
      </>
    );
  }

  return (
    <>
      {(connectionError || offline) && (
        <div className="offline-banner">
          {connectionError || 'Connessione persa — riconnessione in corso…'}
        </div>
      )}
      <AuctionUI
        {...sharedProps}
        stanzaCode={stanzaCode}
        players={players}
        log={log}
        actionError={actionError}
        onInitSetup={handleInitSetup}
        onLoadDemo={handleLoadDemo}
        onStartAuction={handleStartAuction}
        onStopAuction={handleStopAuction}
        onNextPlayer={handleNextPlayer}
        onManualAssign={handleAssign}
        onConfirmNext={handleConfirmNext}
        onRestartPlayer={handleRestartPlayer}
        onOpenSetup={() => setShowSetup(true)}
        onAddPlayer={handleAddPlayer}
        onUpdatePlayer={handleUpdatePlayer}
        onRemovePlayer={handleRemovePlayer}
        onRemoveCoach={handleRemoveCoach}
        onStartSinglePlayer={handleStartSinglePlayer}
        onReassignPlayer={handleReassignPlayer}
        onReAuctionPlayer={handleReAuctionPlayer}
        onForceAssignAll={handleForceAssignAll}
      />
    </>
  );
}
