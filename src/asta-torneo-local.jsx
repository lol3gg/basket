import { useState, useEffect, useRef, useCallback } from 'react';
import {
  buildInitialPlayers,
  AUCTION_SECONDS,
  loadSetup,
  saveSetup,
  mergeSetupIntoPlayers,
  getDemoSetup,
  RESET_ASTA_CONFIRM,
  BANDITORE_COACH_ID,
  BANDITORE_KEY,
  isBanditoreRole,
  isBanditoreConsole,
  joinCoachIntoState,
  upsertSavedCoach,
  addSetupPlayer,
  isMobileDevice,
  getCoachDisplayName,
} from './asta-setup.js';
import { buildRestartPlayerState, buildResetAuctionState, buildReAuctionPlayerState, samePlayerId, findPlayerById, removeCoachFromState } from './asta-logic.js';
import { isAuctionComplete } from './exportAstaPdf.js';
import { applyForcedRosterAssignments, getUnbuyableAvailableCount, canForceAssignPlayers, maybeApplyForcedAssignments, getBidValidationError } from './asta-budget.js';
import { AuctionUI, BanditoreEntryScreen, CoachEntryScreen, CoachMobileUI, FinalResultsScreen, SetupScreen } from './asta-ui.jsx';

const COACH_STORAGE_KEY = 'asta_coach_id';
const STANZA_STORAGE_KEY = 'asta_stanza_code';
const BANDITORE_SESSION_KEY = 'asta_banditore_verified';
const BID_INCREMENT = 1;
const LOCAL_STANZA = 'LOCALE';
const COACH_EXIT_CONFIRM = 'Se esci non potrai rientrare con lo stesso profilo.\n\nDovrai entrare di nuovo come nuovo allenatore.\n\nConfermi l\'uscita?';

function parseSavedCoachId(saved) {
  if (!saved) return null;
  if (saved === BANDITORE_KEY) return BANDITORE_COACH_ID;
  const parsed = Number(saved);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBanditoreSessionVerified() {
  return sessionStorage.getItem(BANDITORE_SESSION_KEY) === '1';
}

function shouldShowEntry() {
  const savedCoach = localStorage.getItem(COACH_STORAGE_KEY);
  const savedStanza = localStorage.getItem(STANZA_STORAGE_KEY);
  if (!savedStanza || !savedCoach) return true;
  if (isBanditoreRole(parseSavedCoachId(savedCoach))) {
    return !isBanditoreSessionVerified();
  }
  return false;
}

export function AstaTorneoLocal() {
  const [coachId, setCoachId] = useState(() => {
    if (!isBanditoreSessionVerified() && isBanditoreRole(parseSavedCoachId(localStorage.getItem(COACH_STORAGE_KEY)))) {
      return null;
    }
    return parseSavedCoachId(localStorage.getItem(COACH_STORAGE_KEY));
  });
  const [stanzaCode, setStanzaCode] = useState(() => localStorage.getItem(STANZA_STORAGE_KEY) ?? '');
  const [showEntry, setShowEntry] = useState(shouldShowEntry);
  const [showSetup, setShowSetup] = useState(false);
  const [bidError, setBidError] = useState('');
  const [actionError, setActionError] = useState('');
  const [resultsDismissed, setResultsDismissed] = useState(false);

  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [currentBidder, setCurrentBidder] = useState(null);
  const [timer, setTimer] = useState(AUCTION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [coaches, setCoaches] = useState([]);
  const [players, setPlayers] = useState(() => buildInitialPlayers());
  const [log, setLog] = useState([{ text: 'Asta pronta (modalità locale).', timestamp: Date.now() }]);

  const timerRef = useRef(null);
  const pendingPlayersRef = useRef(null);
  const stateRef = useRef({});
  const coachRegisteredRef = useRef(false);

  const isAuctioneer = isBanditoreConsole(coachId, isBanditoreSessionVerified());
  stateRef.current = { currentBid, currentBidder, currentPlayer, coaches, players, timer, isRunning, phase };

  const pushLog = (text) => {
    setLog((prev) => [...prev, { text, timestamp: Date.now() }].slice(-100));
  };

  useEffect(() => {
    if (!isAuctionComplete(players, phase, isRunning)) {
      setResultsDismissed(false);
    }
  }, [players, phase, isRunning]);

  useEffect(() => {
    if (!isAuctioneer || showEntry) return;
    setPlayers((prev) => mergeSetupIntoPlayers(prev, loadSetup().players));
  }, [isAuctioneer, showEntry]);

  const joinRoom = ({ stanza, name, role }) => {
    const normalized = stanza.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!normalized || !trimmedName) return;

    localStorage.setItem(STANZA_STORAGE_KEY, normalized);
    setStanzaCode(normalized);
    setShowEntry(false);

    if (role === 'banditore') {
      sessionStorage.setItem(BANDITORE_SESSION_KEY, '1');
      localStorage.setItem(COACH_STORAGE_KEY, String(BANDITORE_COACH_ID));
      setCoachId(BANDITORE_COACH_ID);
      pushLog('Banditore connesso.');
      return;
    }

    const { coaches: nextCoaches, coachId: id, error } = joinCoachIntoState(coaches, null, trimmedName);
    if (error) {
      setShowEntry(true);
      return;
    }
    setCoaches(nextCoaches);
    const joined = nextCoaches.find((c) => c.id === id);
    if (joined) upsertSavedCoach(joined);
    localStorage.setItem(COACH_STORAGE_KEY, String(id));
    setCoachId(id);
    pushLog(`${trimmedName} si è unito all'asta.`);
  };

  const advanceToNext = useCallback((updatedPlayers) => {
    let playersState = updatedPlayers;
    let coachesState = stateRef.current.coaches;
    const { state: forcedState, logLines } = maybeApplyForcedAssignments({
      ...stateRef.current,
      players: playersState,
      coaches: coachesState,
    });
    if (logLines.length > 0) {
      playersState = forcedState.players;
      coachesState = forcedState.coaches;
      setCoaches(coachesState);
      logLines.forEach((text) => pushLog(text));
    }

    const next = playersState.find((p) => p.status === 'available') ?? null;
    setPlayers(playersState);
    setCurrentPlayer(next);
    setCurrentBid(0);
    setCurrentBidder(null);
    setPhase(next ? 'live' : 'idle');
    setTimer(AUCTION_SECONDS);
    setIsRunning(Boolean(next));
    pendingPlayersRef.current = null;
    if (next) pushLog(`Prossimo giocatore: ${next.name}`);
  }, []);

  const handleAssign = useCallback(() => {
    const { currentBid: bid, currentBidder: bidder, currentPlayer: player, coaches: cs, players: ps, phase: ph } =
      stateRef.current;

    if (!player || ph === 'settled') return;

    const winner = bidder != null ? cs.find((c) => samePlayerId(c.id, bidder)) : null;
    const winnerId = winner?.id ?? bidder ?? null;

    const updatedPlayers = ps.map((p) =>
      p.id === player.id ? { ...p, status: 'assigned', coachId: winnerId } : p,
    );

    let updatedCoaches = cs;
    if (winner && bid > 0) {
      updatedCoaches = cs.map((c) => {
        if (!samePlayerId(c.id, winner.id)) return c;
        return {
          ...c,
          budget: c.budget - bid,
          players: [...c.players, { id: player.id, name: player.name, role: player.role, price: bid }],
        };
      });
      pushLog(`${player.name} assegnato a ${winner.name ?? 'Allenatore'} per ${bid} cr.`);
    } else {
      pushLog(`${player.name} non venduto (nessuna offerta).`);
    }

    setPlayers(updatedPlayers);
    setCoaches(updatedCoaches);
    setCurrentBidder(winnerId);
    setCurrentBid(bid);
    setPhase('settled');
    setIsRunning(false);
    setTimer(0);
  }, []);

  useEffect(() => {
    if (!isAuctioneer || phase !== 'live' || !isRunning || !currentPlayer) {
      if (timerRef.current) clearInterval(timerRef.current);
      return undefined;
    }

    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleAssign();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isAuctioneer, phase, isRunning, currentPlayer?.id, handleAssign]);

  const handleRestartPlayer = () => {
    const snapshot = {
      currentBid,
      currentBidder,
      currentPlayer,
      coaches,
      players,
      phase,
      isRunning,
      timer,
    };
    const next = buildRestartPlayerState(snapshot);
    if (!next?.currentPlayer) return;
    pendingPlayersRef.current = next.players;
    setPlayers(next.players);
    setCoaches(next.coaches);
    setCurrentPlayer(next.currentPlayer);
    setCurrentBid(0);
    setCurrentBidder(null);
    setPhase('live');
    setIsRunning(true);
    setTimer(AUCTION_SECONDS);
    pushLog(`Asta riavviata: ${next.currentPlayer.name}`);
  };

  const handleInitSetup = () => {
    if (!window.confirm(RESET_ASTA_CONFIRM)) return;
    const next = buildResetAuctionState(stateRef.current);
    setCurrentPlayer(next.currentPlayer);
    setCurrentBid(next.currentBid);
    setCurrentBidder(next.currentBidder);
    setTimer(next.timer);
    setPhase(next.phase);
    setIsRunning(next.isRunning);
    setCoaches(next.coaches);
    setPlayers(next.players);
    setLog([{ text: 'Asta resettata. Giocatori mantenuti.', timestamp: Date.now() }]);
    setActionError('');
  };

  const handleLoadDemo = () => {
    const currentCount = players.length;
    if (
      currentCount > DEMO_PLAYER_COUNT
      && !window.confirm(
        `Hai ${currentCount} giocatori configurati. La demo ne carica solo ${DEMO_PLAYER_COUNT} e sostituisce la lista salvata. Continuare?`,
      )
    ) return;
    const demo = getDemoSetup();
    saveSetup(demo);
    setPlayers(demo.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team || '—',
      status: 'available',
      coachId: null,
    })));
    setCoaches([]);
    pushLog(`Dati demo caricati (${DEMO_PLAYER_COUNT} giocatori).`);
    setActionError('');
  };

  const handleSetupSave = (draft) => {
    saveSetup(draft);
    setPlayers((prev) => mergeSetupIntoPlayers(prev, draft.players));
    setShowSetup(false);
    pushLog('Configurazione aggiornata.');
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
    setPlayers((prev) => [...prev, gamePlayer]);
    pushLog(`Aggiunto ${gamePlayer.name}`);
  };

  const handleUpdatePlayer = (id, field, value) => {
    if (!isAuctioneer) return;
    const setup = loadSetup();
    saveSetup({ players: setup.players.map((p) => (p.id === id ? { ...p, [field]: value } : p)) });
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleRemovePlayer = (id) => {
    if (!isAuctioneer) return;
    const target = players.find((p) => p.id === id);
    if (!target || target.status === 'assigned' || players.length <= 1) return;
    const setup = loadSetup();
    saveSetup({ players: setup.players.filter((p) => p.id !== id) });
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    pushLog(`Rimosso ${target.name}`);
  };

  const handleStartAuction = () => {
    if (phase === 'paused' && currentPlayer) {
      setPhase('live');
      setIsRunning(true);
      pushLog('Asta ripresa.');
      setActionError('');
      return;
    }

    if (currentPlayer && phase === 'live' && !isRunning) {
      setCurrentBid(0);
      setCurrentBidder(null);
      setTimer(AUCTION_SECONDS);
      setIsRunning(true);
      pushLog(`Asta avviata: ${currentPlayer.name}`);
      setActionError('');
      return;
    }

    const first = players.filter((p) => p.status === 'available')[0] ?? null;
    if (!first) {
      setActionError('Nessun giocatore disponibile.');
      return;
    }
    setCurrentPlayer(first);
    setCurrentBid(0);
    setCurrentBidder(null);
    setTimer(AUCTION_SECONDS);
    setPhase('live');
    setIsRunning(true);
    pushLog(`Asta avviata: ${first.name}`);
    setActionError('');
  };

  const handleStartSinglePlayer = (playerId) => {
    if (!isAuctioneer) {
      setActionError('Sessione banditore non valida. Rientra come banditore.');
      return false;
    }
    const snapshot = stateRef.current;
    const player = findPlayerById(snapshot.players, playerId);
    if (!player || player.status !== 'available') {
      setActionError('Giocatore non disponibile per l\'asta.');
      return false;
    }
    if (
      snapshot.currentPlayer
      && samePlayerId(snapshot.currentPlayer.id, player.id)
      && snapshot.phase === 'live'
    ) {
      return true;
    }
    const replacing = snapshot.currentPlayer && !samePlayerId(snapshot.currentPlayer.id, player.id);
    setCurrentPlayer(player);
    setCurrentBid(0);
    setCurrentBidder(null);
    setPhase('live');
    setIsRunning(false);
    setTimer(AUCTION_SECONDS);
    pushLog(
      replacing
        ? `${player.name} in palco (sostituisce ${snapshot.currentPlayer.name}) — pronto per l'asta`
        : `${player.name} in palco — pronto per l'asta`,
    );
    setActionError('');
    return true;
  };

  const handleReAuctionPlayer = (playerId) => {
    if (!isAuctioneer) return;
    const snapshot = stateRef.current;

    if (import.meta.env.DEV) {
      console.log('[RIASTA] handleReAuctionPlayer — stato PRIMA', {
        playerId,
        phase: snapshot.phase,
        player: snapshot.players.find((p) => samePlayerId(p.id, playerId)),
      });
    }

    if (
      snapshot.phase === 'settled'
      && snapshot.currentPlayer
      && samePlayerId(snapshot.currentPlayer.id, playerId)
    ) {
      setActionError('Conferma l\'asta di questo giocatore prima di riastarlo.');
      return;
    }

    const result = buildReAuctionPlayerState(snapshot, playerId);
    if (!result) {
      setActionError('Impossibile riastare questo giocatore. Verifica che sia assegnato a un allenatore.');
      if (import.meta.env.DEV) {
        console.warn('[RIASTA] buildReAuctionPlayerState ha restituito null');
      }
      return;
    }

    const { state: next, price, coach } = result;

    if (import.meta.env.DEV) {
      console.log('[RIASTA] handleReAuctionPlayer — stato DOPO', {
        player: next.players.find((p) => samePlayerId(p.id, playerId)),
        coachBudget: next.coaches.find((c) => samePlayerId(c.id, coach.id))?.budget,
        currentPlayer: next.currentPlayer,
        phase: next.phase,
        isRunning: next.isRunning,
        price,
      });
    }

    setCoaches(next.coaches);
    setPlayers(next.players);
    setCurrentPlayer(next.currentPlayer);
    setCurrentBid(next.currentBid);
    setCurrentBidder(next.currentBidder);
    setPhase(next.phase);
    setIsRunning(next.isRunning);
    setTimer(next.timer);
    pushLog(`${next.currentPlayer.name} rimesso in asta — ${getCoachDisplayName(coach)} ha riavuto ${price} cr.`);
    setActionError('');
  };

  const handleForceAssignAll = () => {
    if (!isAuctioneer) return;
    const snapshot = stateRef.current;
    const count = getUnbuyableAvailableCount(snapshot.players, snapshot.coaches);
    if (count === 0) return;
    if (!canForceAssignPlayers(snapshot.players, snapshot.coaches)) {
      setActionError('Nessun allenatore ha crediti e posti liberi per l\'assegnazione forzata.');
      return;
    }
    if (!window.confirm(
      `Assegnare i giocatori rimanenti (${count}) a 1 credito ciascuno, in ordine casuale?`,
    )) return;

    const base = {
      ...snapshot,
      isRunning: false,
      phase: 'idle',
      currentPlayer: null,
      currentBid: 0,
      currentBidder: null,
      timer: AUCTION_SECONDS,
    };
    const { state: forcedState, logLines } = applyForcedRosterAssignments(base);
    if (logLines.length === 0) {
      setActionError('Nessuna assegnazione possibile.');
      return;
    }
    setPlayers(forcedState.players);
    setCoaches(forcedState.coaches);
    setCurrentPlayer(null);
    setCurrentBid(0);
    setCurrentBidder(null);
    setPhase('idle');
    setIsRunning(false);
    setTimer(AUCTION_SECONDS);
    logLines.forEach((text) => pushLog(text));
    pushLog(`Assegnazione forzata completata (${logLines.length} giocatore/i a 1 cr.).`);
    setActionError('');
  };

  const handleReassignPlayer = (playerId, newCoachId) => {
    if (!isAuctioneer) return;
    const player = players.find((p) => p.id === playerId);
    if (!player || player.status !== 'assigned' || !player.coachId) return;

    const oldCoachId = player.coachId;
    if (oldCoachId === newCoachId) return;

    const oldCoach = coaches.find((c) => c.id === oldCoachId);
    const newCoach = coaches.find((c) => c.id === newCoachId);
    if (!oldCoach || !newCoach) return;

    const rosterEntry = oldCoach.players.find((rp) => rp.id === playerId);
    const price = rosterEntry?.price ?? 0;
    if (newCoach.budget < price) {
      setActionError('Budget insufficiente per riassegnare questo giocatore.');
      return;
    }

    setPlayers((prev) => prev.map((p) => (
      p.id === playerId ? { ...p, coachId: newCoachId } : p
    )));
    setCoaches((prev) => prev.map((c) => {
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
    }));
    pushLog(`${player.name} riassegnato da ${getCoachDisplayName(oldCoach)} a ${getCoachDisplayName(newCoach)} (${price} cr.)`);
    setActionError('');
  };

  const handleStopAuction = () => {
    setIsRunning(false);
    setPhase('paused');
    pushLog('Asta in pausa.');
  };

  const handleNextPlayer = () => {
    if (phase === 'settled') {
      advanceToNext(players);
      return;
    }

    let coachesState = coaches;
    let playersState = players;
    const { state: forcedState, logLines } = maybeApplyForcedAssignments({
      ...stateRef.current,
      players: playersState,
      coaches: coachesState,
    });
    if (logLines.length > 0) {
      playersState = forcedState.players;
      coachesState = forcedState.coaches;
      setCoaches(coachesState);
      logLines.forEach((text) => pushLog(text));
    }

    const available = playersState.filter((p) => p.status === 'available');
    const next = available.find((p) => p.id !== currentPlayer?.id) ?? available[0] ?? null;
    setPlayers(playersState);
    setCurrentPlayer(next);
    setCurrentBid(0);
    setCurrentBidder(null);
    setPhase(next ? 'live' : 'idle');
    setTimer(AUCTION_SECONDS);
    setIsRunning(Boolean(next));
    if (next) pushLog(`Prossimo giocatore: ${next.name}`);
  };

  const handleConfirmNext = () => {
    if (phase !== 'settled') return;
    advanceToNext(players);
  };

  const handleBid = (amount) => {
    if (isAuctioneer || !coachId) return;
    if (phase !== 'live' || !isRunning || !currentPlayer) {
      setBidError('Nessuna asta attiva.');
      return;
    }
    const coach = coaches.find((c) => c.id === coachId);
    const error = getBidValidationError(coach, amount, currentBid, BID_INCREMENT);
    if (error) {
      setBidError(error);
      return;
    }
    setBidError('');
    setCurrentBid(amount);
    setCurrentBidder(coachId);
    setTimer(AUCTION_SECONDS);
  };

  const applyCoachRemoval = (targetId, logText) => {
    const snapshot = stateRef.current;
    const next = removeCoachFromState(snapshot, targetId);
    setCoaches(next.coaches);
    setPlayers(next.players);
    if (next.currentBidder === targetId) {
      setCurrentBidder(null);
      setCurrentBid(0);
    }
    pushLog(logText);
  };

  const handleRemoveCoach = (targetCoachId) => {
    if (!isAuctioneer) return;
    const coach = coaches.find((c) => c.id === targetCoachId);
    if (!coach) return;
    if (!window.confirm(`Rimuovere ${coach.name} dall'asta?`)) return;
    applyCoachRemoval(targetCoachId, `${coach.name} rimosso dal banditore`);
  };

  const leaveRoom = () => {
    if (isAuctioneer) {
      sessionStorage.removeItem(BANDITORE_SESSION_KEY);
      localStorage.removeItem(COACH_STORAGE_KEY);
      localStorage.removeItem(STANZA_STORAGE_KEY);
      setCoachId(null);
      setStanzaCode('');
      setShowEntry(true);
      return;
    }
    if (!window.confirm(COACH_EXIT_CONFIRM)) return;
    localStorage.removeItem(COACH_STORAGE_KEY);
    localStorage.removeItem(STANZA_STORAGE_KEY);
    setCoachId(null);
    setShowEntry(true);
  };

  useEffect(() => {
    if (isAuctioneer || !coachId || showEntry) {
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
      localStorage.removeItem(COACH_STORAGE_KEY);
      setCoachId(null);
      setShowEntry(true);
    }
  }, [coaches, coachId, isAuctioneer, showEntry]);

  if (showEntry) {
    if (isMobileDevice()) {
      return (
        <CoachEntryScreen
          defaultStanza={stanzaCode || LOCAL_STANZA}
          onJoin={joinRoom}
        />
      );
    }
    return (
      <BanditoreEntryScreen
        defaultStanza={stanzaCode || LOCAL_STANZA}
        onJoin={joinRoom}
      />
    );
  }

  if (showSetup && isAuctioneer) {
    return (
      <SetupScreen
        onSave={handleSetupSave}
        onClose={() => setShowSetup(false)}
        stanzaCode={stanzaCode || LOCAL_STANZA}
        gamePlayers={players}
      />
    );
  }

  if (coachId && isAuctionComplete(players, phase, isRunning) && !resultsDismissed) {
    return (
      <FinalResultsScreen
        stanzaCode={stanzaCode || LOCAL_STANZA}
        coaches={coaches}
        log={log}
        onClose={() => setResultsDismissed(true)}
        onChangeCoach={leaveRoom}
      />
    );
  }

  const sharedProps = {
    coachId,
    isAuctioneer,
    onChangeCoach: leaveRoom,
    connected: true,
    connectedLabel: `Locale · ${stanzaCode || LOCAL_STANZA}`,
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
    return <CoachMobileUI {...sharedProps} />;
  }

  return (
    <AuctionUI
      {...sharedProps}
      stanzaCode={stanzaCode || LOCAL_STANZA}
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
  );
}
