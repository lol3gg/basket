import { useState, useEffect, useRef, useCallback } from 'react';
import {
  buildInitialPlayers,
  AUCTION_SECONDS,
  loadSetup,
  saveSetup,
  mergeSetupIntoPlayers,
  isMobileDevice,
  BANDITORE_KEY,
  isBanditoreRole,
  joinCoachIntoState,
  addSetupPlayer,
  setupCoachesToGameCoaches,
  parseDeepLinkFromUrl,
  clearDeepLinkFromUrl,
} from './asta-setup.js';
import { buildRestartPlayerState, removeCoachFromState } from './asta-logic.js';
import { AuctionUI, CoachMobileUI, MobileLocalEntry, SetupScreen } from './asta-ui.jsx';

const COACH_STORAGE_KEY = 'asta_coach_id';
const BID_INCREMENT = 1;
const LOCAL_STANZA = 'LOCALE';
const COACH_EXIT_CONFIRM = 'Se esci non potrai rientrare con lo stesso profilo.\n\nDovrai entrare di nuovo come nuovo allenatore.\n\nConfermi l\'uscita?';
const INITIAL_DEEP_LINK = parseDeepLinkFromUrl();

export function AstaTorneoLocal() {
  const [coachId, setCoachId] = useState(() => {
    if (INITIAL_DEEP_LINK) return INITIAL_DEEP_LINK.coachId;
    const saved = localStorage.getItem(COACH_STORAGE_KEY);
    if (saved) return isBanditoreRole(saved) ? BANDITORE_KEY : Number(saved);
    if (!isMobileDevice()) {
      localStorage.setItem(COACH_STORAGE_KEY, BANDITORE_KEY);
      return BANDITORE_KEY;
    }
    return null;
  });
  const [showCoachPicker, setShowCoachPicker] = useState(() => {
    if (INITIAL_DEEP_LINK) return false;
    const saved = localStorage.getItem(COACH_STORAGE_KEY);
    return !saved && isMobileDevice();
  });
  const [showSetup, setShowSetup] = useState(false);
  const [bidError, setBidError] = useState('');
  const [actionError, setActionError] = useState('');

  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [currentBidder, setCurrentBidder] = useState(null);
  const [timer, setTimer] = useState(AUCTION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [coaches, setCoaches] = useState(() => {
    const setup = loadSetup();
    let list = setupCoachesToGameCoaches(setup.coaches);
    if (INITIAL_DEEP_LINK) {
      list = list.map((c) => (
        c.id === INITIAL_DEEP_LINK.coachId ? { ...c, online: true } : c
      ));
    }
    return list;
  });
  const [players, setPlayers] = useState(() => buildInitialPlayers());
  const [log, setLog] = useState([{ text: 'Asta pronta (modalità locale).', timestamp: Date.now() }]);

  const timerRef = useRef(null);
  const pendingPlayersRef = useRef(null);
  const stateRef = useRef({});
  const coachRegisteredRef = useRef(false);

  const isAuctioneer = isBanditoreRole(coachId);
  stateRef.current = { currentBid, currentBidder, currentPlayer, coaches, players, timer, isRunning, phase };

  const pushLog = (text) => {
    setLog((prev) => [...prev, { text, timestamp: Date.now() }].slice(-100));
  };

  useEffect(() => {
    if (!INITIAL_DEEP_LINK) return;
    localStorage.setItem(COACH_STORAGE_KEY, String(INITIAL_DEEP_LINK.coachId));
    clearDeepLinkFromUrl();
    pushLog(`${INITIAL_DEEP_LINK.name} entrato dall'link personale.`);
  }, []);

  const advanceToNext = useCallback((updatedPlayers) => {
    const next = updatedPlayers.find((p) => p.status === 'available') ?? null;
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

    const updatedPlayers = ps.map((p) =>
      p.id === player.id ? { ...p, status: 'assigned', coachId: bidder ?? null } : p,
    );

    let updatedCoaches = cs;
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
      pushLog(`${player.name} assegnato a ${winner?.name ?? 'Allenatore'} per ${bid} cr.`);
    } else {
      pushLog(`${player.name} non venduto (nessuna offerta).`);
    }

    pendingPlayersRef.current = updatedPlayers;
    setPlayers(updatedPlayers);
    setCoaches(updatedCoaches);
    setPhase('settled');
    setIsRunning(false);
    setTimer(0);
  }, []);

  useEffect(() => {
    if (!isAuctioneer || phase !== 'live' || !isRunning || !currentPlayer) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
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
  }, [isAuctioneer, phase, currentPlayer?.id, handleAssign]);

  const handleConfirmNext = () => {
    if (!isAuctioneer || phase !== 'settled') return;
    if (pendingPlayersRef.current) advanceToNext(pendingPlayersRef.current);
  };

  const handleRestartPlayer = () => {
    if (!isAuctioneer || phase !== 'settled') return;
    const snapshot = {
      currentPlayer,
      currentBid,
      currentBidder,
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

  const joinLocalCoach = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const savedId = parseSavedCoachId(localStorage.getItem(COACH_STORAGE_KEY));
    const { coaches: nextCoaches, coachId: id } = joinCoachIntoState(coaches, savedId, trimmed);
    setCoaches(nextCoaches);
    localStorage.setItem(COACH_STORAGE_KEY, String(id));
    setCoachId(id);
    setShowCoachPicker(false);
    pushLog(`${trimmed} si è unito all'asta.`);
  };

  function parseSavedCoachId(saved) {
    if (!saved || isBanditoreRole(saved)) return null;
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const reloadFromSetup = () => {
    const setup = loadSetup();
    setCoaches(setupCoachesToGameCoaches(setup.coaches));
    setPlayers(buildInitialPlayers());
  };

  const handleInitSetup = () => {
    reloadFromSetup();
    setCurrentPlayer(null);
    setCurrentBid(0);
    setCurrentBidder(null);
    setTimer(AUCTION_SECONDS);
    setPhase('idle');
    setIsRunning(false);
    setLog([{ text: 'Setup resettato.', timestamp: Date.now() }]);
    setActionError('');
  };

  const handleSetupSave = (draft) => {
    saveSetup(draft);
    setPlayers((prev) => mergeSetupIntoPlayers(prev, draft.players));
    setCoaches((prev) => setupCoachesToGameCoaches(draft.coaches, prev));
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

  const handleStopAuction = () => {
    setPhase('paused');
    setIsRunning(false);
    pushLog('Asta in pausa.');
  };

  const handleNextPlayer = () => {
    if (phase === 'settled') {
      handleConfirmNext();
      return;
    }
    const available = players.filter((p) => p.status === 'available');
    const next = available.find((p) => p.id !== currentPlayer?.id) ?? available[0] ?? null;
    setCurrentPlayer(next);
    setCurrentBid(0);
    setCurrentBidder(null);
    setTimer(AUCTION_SECONDS);
    setPhase(next ? 'live' : 'idle');
    setIsRunning(Boolean(next));
    pendingPlayersRef.current = null;
    if (next) pushLog(`Prossimo giocatore: ${next.name}`);
  };

  const handleBid = (amount) => {
    if (!coachId || isAuctioneer) return;
    if (phase !== 'live' || !isRunning || !currentPlayer) {
      setBidError('Nessuna asta attiva.');
      return;
    }
    const coach = coaches.find((c) => c.id === coachId);
    const minBid = currentBid + BID_INCREMENT;
    if (!coach || coach.budget < amount) {
      setBidError('Budget insufficiente.');
      return;
    }
    if (amount < minBid) {
      setBidError('Offerta troppo bassa.');
      return;
    }
    setCurrentBid(amount);
    setCurrentBidder(coachId);
    setTimer(AUCTION_SECONDS);
    setBidError('');
  };

  const applyCoachRemoval = (targetCoachId, logText) => {
    const snapshot = stateRef.current;
    const coach = snapshot.coaches.find((c) => c.id === targetCoachId);
    if (!coach) return;
    const next = removeCoachFromState(snapshot, targetCoachId);
    setCoaches(next.coaches);
    setPlayers(next.players);
    if (next.currentBidder !== snapshot.currentBidder) {
      setCurrentBidder(next.currentBidder);
      setCurrentBid(next.currentBid);
    }
    pushLog(logText);
  };

  const leaveAsCoachWithConfirm = () => {
    if (!coachId || isAuctioneer) return;
    if (!window.confirm(COACH_EXIT_CONFIRM)) return;
    applyCoachRemoval(coachId, `${coaches.find((c) => c.id === coachId)?.name ?? 'Allenatore'} ha lasciato l'asta.`);
    coachRegisteredRef.current = false;
    localStorage.removeItem(COACH_STORAGE_KEY);
    setCoachId(null);
    setShowCoachPicker(true);
  };

  const handleRemoveCoach = (targetCoachId) => {
    if (!isAuctioneer) return;
    const coach = coaches.find((c) => c.id === targetCoachId);
    if (!coach) return;
    if (!window.confirm(`Rimuovere ${coach.name} dall'asta?\n\nI suoi giocatori torneranno disponibili.`)) return;
    applyCoachRemoval(targetCoachId, `${coach.name} rimosso dal banditore`);
  };

  useEffect(() => {
    if (isAuctioneer || !coachId || showCoachPicker) {
      coachRegisteredRef.current = false;
      return;
    }
    if (coaches.some((c) => c.id === coachId)) {
      coachRegisteredRef.current = true;
      return;
    }
    if (coachRegisteredRef.current) {
      coachRegisteredRef.current = false;
      alert('Sei stato rimosso dall\'asta dal banditore.');
      localStorage.removeItem(COACH_STORAGE_KEY);
      setCoachId(null);
      setShowCoachPicker(true);
    }
  }, [coaches, coachId, isAuctioneer, showCoachPicker]);

  if (showCoachPicker) {
    return <MobileLocalEntry onJoin={joinLocalCoach} />;
  }

  if (showSetup && isAuctioneer) {
    return (
      <SetupScreen
        onSave={handleSetupSave}
        onClose={() => setShowSetup(false)}
        stanzaCode={LOCAL_STANZA}
      />
    );
  }

  const sharedProps = {
    coachId,
    onChangeCoach: isAuctioneer
      ? () => { localStorage.removeItem(COACH_STORAGE_KEY); setShowCoachPicker(true); }
      : leaveAsCoachWithConfirm,
    connected: true,
    connectedLabel: 'Locale',
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
      players={players}
      log={log}
      actionError={actionError}
      onInitSetup={handleInitSetup}
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
    />
  );
}
