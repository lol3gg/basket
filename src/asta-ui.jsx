import { useState } from 'react';
import {
  getCoachColor,
  INITIAL_BUDGET,
  AUCTION_SECONDS,
  loadSetup,
  saveSetup,
  splitPlayerName,
  createSetupPlayer,
  getAppBaseUrl,
  buildShareInviteMessage,
  isMobileDevice,
  isBanditoreRole,
  getCoachDisplayName,
  getJoinedCoaches,
  BANDITORE_COACH_ID,
  BANDITORE_PASSWORD,
} from './asta-setup.js';
import { useAuctionBeep, useBidSound, usePlayerStartSound, playBidFeedback, URGENT_TIMER_SECONDS } from './useAuctionBeep.js';
import { FullscreenToggle } from './useFullscreen.jsx';

const ROSTER_SLOTS = 5;
const APP_TITLE = 'Asta Torneo Basket';
const TABS = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'rosters', label: 'Tutte le rose' },
  { id: 'players', label: 'Giocatori' },
  { id: 'log', label: 'Log' },
];

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ArenaHeader({ meta, onChangeCoach, actions }) {
  return (
    <header className="dash-header">
      <div className="dash-brand">
        <div className="arena-line" />
        <h1 className="arena-title">{APP_TITLE}</h1>
        <div className="arena-line" />
      </div>
      <div className="dash-toolbar">
        <div className="dash-meta">{meta}</div>
        <div className="dash-actions">
          {actions}
          {!isMobileDevice() && <FullscreenToggle />}
          <button type="button" className="btn-ghost" onClick={onChangeCoach}>
            Cambia allenatore
          </button>
        </div>
      </div>
    </header>
  );
}

export function CourtBackground() {
  return (
    <svg className="court-bg" viewBox="0 0 940 500" aria-hidden="true">
      <rect x="20" y="20" width="900" height="460" fill="none" stroke="currentColor" strokeWidth="3" />
      <line x1="470" y1="20" x2="470" y2="480" stroke="currentColor" strokeWidth="3" />
      <circle cx="470" cy="250" r="70" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="20" y="160" width="190" height="180" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="730" y="160" width="190" height="180" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function TimerRing({ timer, max = 10, size = 'md' }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, timer / max));
  const urgent = timer > 0 && timer <= URGENT_TIMER_SECONDS;

  return (
    <svg className={`timer-ring timer-${size} ${urgent ? 'timer-urgent' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={r} className="timer-ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="timer-ring-fill"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
      />
      <text x="60" y="66" textAnchor="middle" className="timer-ring-text">{timer}</text>
    </svg>
  );
}

export function JerseyCard({ player, currentBid, leadingCoachId, timer, phase, winnerName }) {
  if (!player) {
    return (
      <div className="jersey-card jersey-empty">
        <span className="empty-icon">?</span>
        <p className="empty-title">Nessuno in asta</p>
        <p className="muted">Il banditore avvia la prossima chiamata</p>
      </div>
    );
  }

  const isSettled = phase === 'settled';
  const { line1, line2 } = splitPlayerName(player.name);
  const accent = getCoachColor(leadingCoachId);
  const sold = isSettled && currentBid > 0 && leadingCoachId;

  return (
    <div
      key={player.id}
      className={`jersey-card slam-in ${isSettled ? 'jersey-settled' : ''}`}
      style={{ '--jersey-accent': accent }}
    >
      {isSettled && (
        <div className={`settled-banner ${sold ? 'sold' : 'unsold'}`}>
          {sold ? `Aggiudicato · ${winnerName}` : 'Non venduto'}
        </div>
      )}
      <div className="jersey-top">
        <span className="jersey-badge role">{player.role}</span>
        <span className="jersey-number">#{player.id}</span>
        <span className="jersey-badge team">{player.team || '—'}</span>
      </div>
      <div className="jersey-body">
        <span className="jersey-watermark">{player.id}</span>
        <div className="jersey-name">
          <span>{line1.toUpperCase()}</span>
          {line2 && <span>{line2.toUpperCase()}</span>}
        </div>
      </div>
      <div className="jersey-footer">
        <div className="jersey-bid">
          <span className="label">{isSettled ? 'Prezzo finale' : 'Offerta'}</span>
          <span className="bid-value">{currentBid}</span>
          <span className="label credits">cr.</span>
        </div>
        {!isSettled && (
          <div className="jersey-timer">
            <TimerRing timer={timer} max={AUCTION_SECONDS} size="sm" />
            <span className="timer-caption">Tempo</span>
          </div>
        )}
        {isSettled && (
          <div className="jersey-closed">
            <span className="closed-label">Chiuso</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent ? 'accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function CoachCard({ coach, isLeading, isOffline }) {
  const spent = INITIAL_BUDGET - coach.budget;
  const pct = Math.round((coach.budget / INITIAL_BUDGET) * 100);
  const displayName = getCoachDisplayName(coach);

  return (
    <li
      className={`coach-card ${isLeading ? 'leading' : ''} ${isOffline ? 'offline' : ''}`}
    >
      <div className="coach-card-head">
        <span className="coach-num" style={{ '--coach-color': getCoachColor(coach.id) }}>{coach.id}</span>
        <div className="coach-card-info">
          <span className="coach-name">{displayName}</span>
          <span className="coach-budget">{coach.budget} cr. rimasti</span>
        </div>
        <span className="coach-pill">{coach.players.length} gioc.</span>
      </div>
      <div className="budget-bar">
        <div className="budget-bar-fill" style={{ width: `${pct}%`, background: getCoachColor(coach.id) }} />
      </div>
      <span className="coach-spent">{spent} cr. spesi</span>
    </li>
  );
}

function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab-btn ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function EntryScreen({ defaultStanza = '', onJoin }) {
  const [stanza, setStanza] = useState(defaultStanza);
  const [name, setName] = useState('');
  const [role, setRole] = useState('coach');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const isBanditore = role === 'banditore';

  const handleJoin = () => {
    const stanzaNorm = stanza.trim().toUpperCase();
    const nameTrim = name.trim();
    if (!stanzaNorm || !nameTrim) {
      setError('Compila nome stanza e il tuo nome.');
      return;
    }
    if (isBanditore && password !== BANDITORE_PASSWORD) {
      setError('Password banditore non valida.');
      return;
    }
    setError('');
    onJoin({
      stanza: stanzaNorm,
      name: nameTrim,
      role: isBanditore ? 'banditore' : 'coach',
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin();
  };

  const canSubmit = stanza.trim() && name.trim() && (!isBanditore || password);

  return (
    <div className="app dash">
      <header className="dash-header">
        <div className="dash-brand">
          <div className="arena-line" />
          <h1 className="arena-title">{APP_TITLE}</h1>
          <div className="arena-line" />
        </div>
        <p className="dash-subtitle">Entra nell&apos;asta del torneo</p>
      </header>

      <div className="room-entry room-entry-unified">
        <label className="room-label" htmlFor="entry-stanza">Nome stanza</label>
        <input
          id="entry-stanza"
          type="text"
          className="room-input"
          placeholder="es. TORNEO2025"
          value={stanza}
          onChange={(e) => setStanza(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        <label className="room-label" htmlFor="entry-name">Il tuo nome</label>
        <input
          id="entry-name"
          type="text"
          className="room-input room-input-sm"
          placeholder="es. Marco"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="name"
        />

        <p className="room-label room-coach-label">Ruolo</p>
        <div className="entry-role-grid">
          <button
            type="button"
            className={`picker-card entry-role-card ${role === 'coach' ? 'selected' : ''}`}
            style={{ '--coach-color': getCoachColor(2) }}
            onClick={() => setRole('coach')}
          >
            <span className="picker-name">Allenatore</span>
            <span className="picker-tag muted-tag">Rilancia dal telefono</span>
          </button>
          <button
            type="button"
            className={`picker-card entry-role-card ${role === 'banditore' ? 'selected' : ''}`}
            style={{ '--coach-color': getCoachColor(1) }}
            onClick={() => setRole('banditore')}
          >
            <span className="picker-name">Banditore</span>
            <span className="picker-tag">Controlli asta · PC</span>
          </button>
        </div>

        {isBanditore && (
          <>
            <label className="room-label" htmlFor="entry-password">Password banditore</label>
            <input
              id="entry-password"
              type="password"
              className="room-input room-input-sm"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
            />
          </>
        )}

        {error && (
          <p className="room-password-alert alert" role="alert">{error}</p>
        )}

        <button
          type="button"
          className="btn-cta btn-cta-lg room-enter-btn"
          disabled={!canSubmit}
          onClick={handleJoin}
        >
          ENTRA
        </button>

        {!isMobileDevice() && (
          <div className="room-fullscreen-row">
            <FullscreenToggle className="btn-secondary btn-fullscreen" />
            <span className="muted room-fullscreen-hint">Esc per uscire dallo schermo intero</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CoachJoinPending({ name, error, hint, onBack, onRetry }) {
  return (
    <div className="app mobile-coach">
      <p className="mobile-app-brand mobile-app-brand-center">{APP_TITLE}</p>
      <div className="mobile-join-pending">
        {!error && <span className="mobile-join-spinner" aria-hidden="true" />}
        <p>{error ? 'Entrata non riuscita' : 'Connessione in corso…'}</p>
        <p className="muted">
          {error
            ? 'Il banditore deve aprire la stanza sul PC prima degli allenatori.'
            : `Ciao ${name}, collegamento alla stanza…`}
        </p>
        {hint && !error && <p className="mobile-join-hint muted">{hint}</p>}
        {error && <div className="alert mobile-alert">{error}</div>}
        <div className="mobile-join-actions">
          {error && onRetry && (
            <button type="button" className="btn-cta btn-cta-lg" onClick={onRetry}>
              Riprova
            </button>
          )}
          {onBack && (
            <button type="button" className="btn-secondary btn-cta-lg" onClick={onBack}>
              Torna indietro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CoachMobileUI({
  coachId,
  onChangeCoach,
  connected,
  connectedLabel,
  currentPlayer,
  currentBid,
  currentBidder,
  timer,
  phase,
  isRunning,
  coaches,
  bidError,
  onBid,
}) {
  const myCoach = coaches.find((c) => c.id === coachId);
  const myColor = getCoachColor(coachId);
  const isLive = phase === 'live' && isRunning;
  const isPaused = phase === 'paused';
  const isSettled = phase === 'settled';
  const leadingCoach = coaches.find((c) => c.id === currentBidder);
  const iAmLeading = currentBidder === coachId;
  const sold = isSettled && currentBid > 0 && currentBidder;
  const iWon = sold && iAmLeading;
  const winnerName = leadingCoach ? getCoachDisplayName(leadingCoach) : null;

  useAuctionBeep({
    timer,
    phase,
    isRunning,
    currentPlayerId: currentPlayer?.id,
  });

  useBidSound({
    currentBid,
    currentBidder,
    phase,
    isRunning,
    currentPlayerId: currentPlayer?.id,
  });

  usePlayerStartSound({
    currentPlayerId: currentPlayer?.id,
    phase,
    isRunning,
    currentBid,
    timer,
    maxTimer: AUCTION_SECONDS,
  });

  const bidAmounts = [
    { label: '+1', amount: Math.max(currentBid + 1, 1) },
    { label: '+5', amount: currentBid + 5 },
    { label: '+10', amount: currentBid + 10 },
  ];

  const statusText = isSettled
    ? 'Attendi la conferma del banditore'
    : isPaused
      ? 'Asta in pausa'
      : isLive
        ? (iAmLeading ? 'Sei in testa!' : 'Rilancia ora')
        : 'In attesa che il banditore avvii…';

  const settledMessage = isSettled && currentPlayer
    ? (sold
      ? (iWon ? 'Te l\'hai aggiudicato!' : `Aggiudicato a ${winnerName}`)
      : 'Non venduto')
    : null;

  return (
    <div className="app mobile-coach">
      <header className="mobile-coach-header">
        <p className="mobile-app-brand">{APP_TITLE}</p>
        <div className="mobile-coach-top">
          <span className={`pill ${connected ? 'ok' : 'err'}`}>
            {connectedLabel ?? (connected ? 'Live' : 'Offline')}
          </span>
          <button type="button" className="btn-ghost btn-ghost-sm" onClick={onChangeCoach}>
            Esci
          </button>
        </div>
        <h1 className="mobile-coach-name" style={{ '--coach-color': myColor }}>
          {getCoachDisplayName(myCoach)}
        </h1>
        <p className="mobile-coach-budget">{myCoach?.budget ?? 0} crediti disponibili</p>
      </header>

      {bidError && <div className="alert mobile-alert">{bidError}</div>}

      <section className="mobile-stage">
        {currentPlayer ? (
          <>
            <p className="mobile-player-label">{isSettled ? 'Asta chiusa' : 'In asta'}</p>
            <h2 className="mobile-player-name">{currentPlayer.name}</h2>
            {isSettled && settledMessage && (
              <div
                className={`mobile-settled-banner ${sold ? (iWon ? 'won' : 'sold') : 'unsold'}`}
                style={sold ? { '--coach-color': getCoachColor(currentBidder) } : undefined}
              >
                {settledMessage}
              </div>
            )}
            <div className="mobile-bid-box">
              <span className="mobile-bid-label">{isSettled ? 'Prezzo finale' : 'Offerta attuale'}</span>
              <span className="mobile-bid-value">{currentBid}</span>
              <span className="mobile-bid-credits">crediti</span>
            </div>
            {leadingCoach && isLive && (
              <p className="mobile-leading" style={{ '--coach-color': getCoachColor(leadingCoach.id) }}>
                In testa: {getCoachDisplayName(leadingCoach)}
              </p>
            )}
            {isLive && (
              <div className="mobile-timer">
                <TimerRing timer={timer} max={AUCTION_SECONDS} size="md" />
              </div>
            )}
          </>
        ) : (
          <div className="mobile-waiting">
            <p className="mobile-waiting-title">Nessuno in asta</p>
            <p className="muted">Attendi il prossimo giocatore</p>
          </div>
        )}
        <p className={`mobile-status ${isLive ? 'live' : ''} ${isSettled ? 'settled' : ''}`}>{statusText}</p>
      </section>

      {isLive && currentPlayer && myCoach && (
        <div className="mobile-bid-row">
          {bidAmounts.map(({ label, amount }) => {
            const disabled = myCoach.budget < amount;
            return (
              <button
                key={label}
                type="button"
                className="mobile-bid-btn"
                style={{ '--coach-color': disabled ? undefined : myColor }}
                disabled={disabled}
                onClick={() => {
                  playBidFeedback();
                  onBid(amount);
                }}
              >
                <span className="mobile-bid-btn-label">{label}</span>
                <span className="mobile-bid-btn-amount">{amount} cr.</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function AddPlayerModal({ onConfirm, onClose }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('G');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Inserisci il nome del giocatore.');
      return;
    }
    onConfirm({ name: trimmed, role, team: team.trim() });
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-player-title"
      >
        <h2 id="add-player-title" className="modal-title">Nuovo giocatore</h2>
        <p className="modal-sub muted">Compila i dati per aggiungerlo all&apos;asta.</p>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="room-label">Nome</span>
            <input
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Es. Marco Rossi"
              autoFocus
            />
          </label>
          <label className="modal-field">
            <span className="room-label">Ruolo</span>
            <select className="modal-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="G">G — Guardia</option>
              <option value="A">A — Ala</option>
              <option value="C">C — Centro</option>
            </select>
          </label>
          <label className="modal-field">
            <span className="room-label">Squadra <span className="muted">(opzionale)</span></span>
            <input
              type="text"
              className="modal-input"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="Es. Lakers"
            />
          </label>
          {error && <div className="alert modal-alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
            <button type="submit" className="btn-cta">Aggiungi giocatore</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShareLinksSection({ stanzaCode }) {
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  const appUrl = getAppBaseUrl();
  const normalizedStanza = stanzaCode?.trim().toUpperCase() || '';
  const message = normalizedStanza ? buildShareInviteMessage(normalizedStanza) : '';

  const shareInvite = async () => {
    if (!message) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: message, title: 'Asta Torneo Basket' });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setShareStatus('Messaggio copiato — incollalo su WhatsApp');
      setTimeout(() => setShareStatus(''), 3000);
    } catch {
      setShareStatus('Condivisione non riuscita');
      setTimeout(() => setShareStatus(''), 2500);
    }
  };

  const copyInvite = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareStatus('Copia non riuscita');
      setTimeout(() => setShareStatus(''), 2000);
    }
  };

  return (
    <section className="dash-panel share-links-panel">
      <div className="panel-head">
        <h2 className="panel-title">Invita allenatori</h2>
        {normalizedStanza && <span className="panel-count">Stanza {normalizedStanza}</span>}
      </div>

      {!normalizedStanza ? (
        <p className="setup-note muted">
          Entra con una stanza per condividere l&apos;invito agli allenatori.
        </p>
      ) : (
        <>
          <p className="setup-note muted">
            Un solo link per tutti. Gli allenatori inseriscono nome stanza e il proprio nome.
          </p>
          <div className="share-invite-preview">
            <code className="share-link-url">{appUrl}</code>
            <p className="share-stanza-label">
              Nome stanza: <strong>{normalizedStanza}</strong>
            </p>
          </div>
          <div className="share-links-actions">
            <button type="button" className="btn-cta" onClick={shareInvite}>
              Condividi su WhatsApp
            </button>
            <button type="button" className="btn-secondary share-all-btn" onClick={copyInvite}>
              {copied ? 'Copiato ✓' : 'Copia invito'}
            </button>
          </div>
        </>
      )}
      {shareStatus && <p className="share-status muted">{shareStatus}</p>}
    </section>
  );
}

export function SetupScreen({ onSave, onClose, stanzaCode = '' }) {
  const [draft, setDraft] = useState(() => loadSetup());
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  const updatePlayer = (id, field, value) => {
    setDraft((d) => ({
      ...d,
      players: d.players.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const addPlayer = (fields) => {
    setDraft((d) => ({
      ...d,
      players: [...d.players, createSetupPlayer(d.players, fields)],
    }));
    setShowAddPlayerModal(false);
  };

  const removePlayer = (id) => {
    setDraft((d) => {
      if (d.players.length <= 1) return d;
      return { ...d, players: d.players.filter((p) => p.id !== id) };
    });
  };

  const handleSave = () => {
    saveSetup(draft);
    onSave(draft);
  };

  return (
    <div className="app dash">
      <ArenaHeader
        meta={<span className="pill">Configurazione torneo</span>}
        onChangeCoach={onClose}
      />
      <div className="setup-grid setup-grid-single">
        <section className="dash-panel setup-players-panel">
          <div className="panel-head">
            <h2 className="panel-title">Giocatori in asta</h2>
            <span className="panel-count">{draft.players.length} totali</span>
            <button type="button" className="btn-secondary setup-add-btn" onClick={() => setShowAddPlayerModal(true)}>
              + Aggiungi giocatore
            </button>
          </div>
          <ul className="setup-list players">
            {draft.players.map((p) => (
              <li key={p.id}>
                <span className="player-id">#{p.id}</span>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updatePlayer(p.id, 'name', e.target.value)}
                  placeholder={`Giocatore ${p.id}`}
                />
                <select value={p.role} onChange={(e) => updatePlayer(p.id, 'role', e.target.value)}>
                  <option value="G">G</option>
                  <option value="A">A</option>
                  <option value="C">C</option>
                </select>
                <button
                  type="button"
                  className="btn-setup-remove"
                  onClick={() => removePlayer(p.id)}
                  disabled={draft.players.length <= 1}
                  title="Rimuovi giocatore"
                  aria-label={`Rimuovi ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ShareLinksSection stanzaCode={stanzaCode} />
      <div className="setup-actions">
        <button type="button" className="btn-cta" onClick={handleSave}>Salva configurazione</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Torna alla dashboard</button>
      </div>
      {showAddPlayerModal && (
        <AddPlayerModal
          onConfirm={addPlayer}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}
    </div>
  );
}

export function AuctionUI({
  coachId,
  onChangeCoach,
  connected,
  connectedLabel,
  currentPlayer,
  currentBid,
  currentBidder,
  timer,
  phase,
  isRunning,
  coaches,
  players,
  log,
  bidError,
  actionError,
  onBid,
  onInitSetup,
  onStartAuction,
  onStopAuction,
  onNextPlayer,
  onManualAssign,
  onConfirmNext,
  onRestartPlayer,
  onOpenSetup,
  onAddPlayer,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveCoach,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  const isAuctioneer = isBanditoreRole(coachId);
  const joinedCoaches = getJoinedCoaches(coaches);
  const myCoach = isAuctioneer ? null : coaches.find((c) => c.id === coachId);
  const availablePlayers = players.filter((p) => p.status === 'available');
  const assignedPlayers = players.filter((p) => p.status === 'assigned');
  const leadingCoach = coaches.find((c) => c.id === currentBidder);
  const myColor = isAuctioneer ? '#E8522A' : getCoachColor(coachId);
  const isSettled = phase === 'settled';
  const isPaused = phase === 'paused';
  const isLive = phase === 'live' && isRunning;
  const progress = Math.round((assignedPlayers.length / players.length) * 100) || 0;
  const totalSpent = joinedCoaches.reduce((s, c) => s + (INITIAL_BUDGET - c.budget), 0);
  const statusLabel = isSettled
    ? 'In attesa conferma'
    : isPaused
      ? 'In pausa'
      : isRunning
        ? 'Asta in corso'
        : 'In attesa';
  const availableCount = players.filter((p) => p.status === 'available').length;
  const canConfirmNext = isSettled;

  useAuctionBeep({
    timer,
    phase,
    isRunning,
    currentPlayerId: currentPlayer?.id,
  });

  useBidSound({
    currentBid,
    currentBidder,
    phase,
    isRunning,
    currentPlayerId: currentPlayer?.id,
  });

  usePlayerStartSound({
    currentPlayerId: currentPlayer?.id,
    phase,
    isRunning,
    currentBid,
    timer,
    maxTimer: AUCTION_SECONDS,
  });

  const bidAmounts = [
    { label: '+1', amount: Math.max(currentBid + 1, 1) },
    { label: '+5', amount: currentBid + 5 },
    { label: '+10', amount: currentBid + 10 },
  ];

  const auctioneerActions = isAuctioneer && (
    <>
      {isSettled ? (
        <button type="button" className="btn-cta" onClick={onConfirmNext} disabled={!canConfirmNext}>
          Conferma prossimo
        </button>
      ) : (
        <>
          <button type="button" className="btn-cta" onClick={onOpenSetup}>Setup</button>
          {isPaused ? (
            <button type="button" className="btn-cta" onClick={onStartAuction}>Riprendi</button>
          ) : (
            <button type="button" className="btn-cta" onClick={onStartAuction} disabled={isRunning || isLive}>Avvia</button>
          )}
          <button type="button" className="btn-secondary" onClick={onStopAuction} disabled={!isLive}>Pausa</button>
          <button type="button" className="btn-secondary" onClick={onNextPlayer}>Salta</button>
          <button type="button" className="btn-secondary" onClick={onManualAssign}>Assegna</button>
          <button type="button" className="btn-secondary" onClick={onInitSetup}>Reset</button>
        </>
      )}
    </>
  );

  return (
    <div className="app dash">
      <ArenaHeader
        meta={(
          <>
            <span className={`pill ${connected ? 'ok' : 'err'}`}>
              {connectedLabel ?? (connected ? 'Live' : 'Offline')}
            </span>
            <span className={`pill ${isLive ? 'live' : ''} ${isSettled ? 'settled' : ''} ${isPaused ? 'paused' : ''}`}>
              {statusLabel}
            </span>
            <span className="pill user-pill" style={{ '--coach-color': myColor }}>
              {isAuctioneer ? 'Banditore · Console' : getCoachDisplayName(myCoach)}
            </span>
          </>
        )}
        onChangeCoach={onChangeCoach}
        actions={auctioneerActions}
      />

      {(actionError || bidError) && <div className="alert">{actionError || bidError}</div>}

      <section className="stats-row">
        <StatCard label="Disponibili" value={availablePlayers.length} sub={`su ${players.length}`} />
        <StatCard label="Assegnati" value={assignedPlayers.length} accent />
        <StatCard label="Offerta attuale" value={currentBid} sub="crediti" accent />
        <StatCard label="Timer" value={isSettled ? '—' : `${timer}s`} sub={isSettled ? 'conferma' : isPaused ? 'in pausa' : isLive ? 'asta' : 'fermo'} />
        <StatCard label="Spesi totali" value={totalSpent} sub="crediti lega" />
      </section>

      <div className="progress-block">
        <div className="progress-head">
          <span>Avanzamento asta</span>
          <span>{progress}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="dash-main">
        <aside className="dash-panel coaches-sidebar">
          <div className="panel-head">
            <h2 className="panel-title">Classifica budget</h2>
          </div>
          <ul className="coaches-cards">
            {joinedCoaches.length === 0 && (
              <li className="muted coaches-empty">Nessun allenatore connesso — entrano con nome e stanza</li>
            )}
            {joinedCoaches.map((c) => (
              <CoachCard
                key={c.id}
                coach={c}
                isLeading={c.id === currentBidder}
                isOffline={!c.online}
              />
            ))}
          </ul>
        </aside>

        <section className="dash-panel stage-panel">
          <CourtBackground />
          <div className="stage-inner">
            <div className="stage-head">
              <h2 className="panel-title">Palco asta</h2>
              {leadingCoach && isLive && (
                <span className="leading-chip" style={{ '--coach-color': getCoachColor(leadingCoach.id) }}>
                  In testa: {getCoachDisplayName(leadingCoach)}
                </span>
              )}
            </div>
            <JerseyCard
              player={currentPlayer}
              currentBid={currentBid}
              leadingCoachId={currentBidder}
              timer={timer}
              phase={phase}
              winnerName={leadingCoach ? getCoachDisplayName(leadingCoach) : undefined}
            />
            {isSettled && isAuctioneer && (
              <div className="settled-actions">
                <button type="button" className="btn-cta btn-confirm-stage" onClick={onConfirmNext} disabled={!canConfirmNext}>
                  Conferma · Prossimo giocatore
                </button>
                <button type="button" className="btn-secondary btn-restart-stage" onClick={onRestartPlayer}>
                  Riavvia asta di questo giocatore
                </button>
              </div>
            )}
            {isSettled && !isAuctioneer && (
              <p className="leading-label settled-msg">
                Asta chiusa — in attesa della conferma del banditore
              </p>
            )}
            {isLive && timer > 0 && timer <= URGENT_TIMER_SECONDS && (
              <p className="urgent-hint">Ultimi secondi — rilancia ora!</p>
            )}
            {!isAuctioneer && isLive && currentPlayer && myCoach && (
              <div className="bid-row">
                {bidAmounts.map(({ label, amount }) => {
                  const disabled = myCoach.budget < amount;
                  return (
                    <button
                      key={label}
                      type="button"
                      className="bid-btn"
                      style={{ '--coach-color': disabled ? undefined : myColor }}
                      disabled={disabled}
                      onClick={() => {
                  playBidFeedback();
                  onBid(amount);
                }}
                    >
                      {label}
                      <span>{amount} cr.</span>
                    </button>
                  );
                })}
              </div>
            )}
            {isPaused && isAuctioneer && (
              <p className="stage-hint muted">Timer in pausa — clicca Riprendi per continuare</p>
            )}
            {!isAuctioneer && isPaused && (
              <p className="stage-hint muted">Asta in pausa — in attesa del banditore</p>
            )}
            {!isAuctioneer && !isLive && !isSettled && !isPaused && (
              <p className="stage-hint muted">In attesa che il banditore avvii l&apos;asta…</p>
            )}
          </div>
        </section>

        {isAuctioneer ? (
          <aside className="dash-panel admin-panel">
            <div className="panel-head">
              <h2 className="panel-title">Allenatori connessi</h2>
              <span className="panel-count">{joinedCoaches.length}</span>
            </div>
            <ul className="admin-coach-list">
              {joinedCoaches.length === 0 && (
                <li className="muted">In attesa del primo allenatore…</li>
              )}
              {joinedCoaches.map((c) => (
                <li key={c.id} className={c.online ? 'online' : 'offline'}>
                  <span className="coach-num sm" style={{ '--coach-color': getCoachColor(c.id) }}>{c.id}</span>
                  <span className="admin-coach-name">{getCoachDisplayName(c)}</span>
                  <span className="admin-coach-budget">{c.budget} cr.</span>
                  {onRemoveCoach && c.id !== BANDITORE_COACH_ID && (
                    <button
                      type="button"
                      className="admin-coach-remove"
                      title={`Rimuovi ${getCoachDisplayName(c)}`}
                      aria-label={`Rimuovi ${getCoachDisplayName(c)}`}
                      onClick={() => onRemoveCoach(c.id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="setup-note muted">Ogni allenatore entra con nome e codice stanza.</p>
          </aside>
        ) : (
          <aside className="dash-panel myteam-panel">
            <div className="panel-head">
              <h2 className="panel-title">La tua squadra</h2>
              <span className="coach-num sm" style={{ '--coach-color': myColor }}>{coachId}</span>
            </div>
            {myCoach ? (
              <>
                <div className="myteam-budget">
                  <span className="budget-big">{myCoach.budget}</span>
                  <span className="budget-label">crediti disponibili</span>
                </div>
                <div className="budget-bar lg">
                  <div
                    className="budget-bar-fill"
                    style={{
                      width: `${Math.round((myCoach.budget / INITIAL_BUDGET) * 100)}%`,
                      background: myColor,
                    }}
                  />
                </div>
                <ul className="roster-list">
                  {myCoach.players.map((p) => (
                    <li key={p.id} className="roster-slot filled">
                      <span className="roster-name">{p.name}</span>
                      <span className="roster-meta">{p.role} · {p.price} cr.</span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, ROSTER_SLOTS - myCoach.players.length) }).map((_, i) => (
                    <li key={`e-${i}`} className="roster-slot empty">+ Slot libero</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Profilo non trovato</p>
            )}
          </aside>
        )}
      </div>

      <section className="dash-panel tabs-panel">
        <TabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' && (
          <div className="tab-content overview-grid">
            <div className="overview-block">
              <h3 className="sub-title">Prossimi in lista</h3>
              <ul className="queue-list">
                {availablePlayers.slice(0, 6).map((p, i) => (
                  <li key={p.id} className={currentPlayer?.id === p.id ? 'active' : ''}>
                    <span className="queue-pos">{i + 1}</span>
                    <span>{p.name}</span>
                    <span className="role-tag">{p.role}</span>
                  </li>
                ))}
                {availablePlayers.length === 0 && <li className="muted">Asta completata</li>}
              </ul>
            </div>
            <div className="overview-block">
              <h3 className="sub-title">Ultimi movimenti</h3>
              <ul className="log-list compact">
                {[...log].reverse().slice(0, 6).map((entry, i) => (
                  <li key={`${entry.timestamp}-${i}`} className="log-item slide-in">
                    <span className="log-time">{formatTime(entry.timestamp)}</span>
                    {entry.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overview-block">
              <h3 className="sub-title">Riepilogo ruoli assegnati</h3>
              <div className="role-stats">
                {['G', 'A', 'C'].map((role) => {
                  const n = assignedPlayers.filter((p) => p.role === role).length;
                  return (
                    <div key={role} className="role-stat">
                      <span className="role-tag lg">{role}</span>
                      <span>{n} assegnati</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rosters' && (
          <div className="tab-content rosters-grid">
            {joinedCoaches.length === 0 && (
              <p className="muted">Nessuna rosa — gli allenatori devono entrare dal link.</p>
            )}
            {joinedCoaches.map((c) => (
              <div key={c.id} className="team-card" style={{ '--coach-color': getCoachColor(c.id) }}>
                <div className="team-card-head">
                  <span className="coach-num sm">{c.id}</span>
                  <span className="team-name">{getCoachDisplayName(c)}</span>
                  <span className="team-budget">{c.budget} cr.</span>
                </div>
                <ul className="team-roster">
                  {c.players.length === 0 && <li className="roster-slot empty">Nessun giocatore</li>}
                  {c.players.map((p) => (
                    <li key={p.id} className="roster-slot filled sm">
                      <span>{p.name}</span>
                      <span className="muted">{p.role} · {p.price}</span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, ROSTER_SLOTS - c.players.length) }).map((_, i) => (
                    <li key={`t-${i}`} className="roster-slot empty sm">—</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="tab-content">
            {isAuctioneer && (
              <div className="players-tab-head">
                <p className="setup-note muted">Aggiungi o modifica i giocatori in qualsiasi momento.</p>
                <button type="button" className="btn-secondary setup-add-btn" onClick={() => setShowAddPlayerModal(true)}>
                  + Aggiungi giocatore
                </button>
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome</th>
                  <th>Ruolo</th>
                  <th>Stato</th>
                  <th>Squadra</th>
                  {isAuctioneer && <th aria-label="Azioni" />}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const owner = coaches.find((c) => c.id === p.coachId);
                  const editable = isAuctioneer && p.status === 'available';
                  return (
                    <tr key={p.id} className={currentPlayer?.id === p.id ? 'row-active' : ''}>
                      <td>{p.id}</td>
                      <td>
                        {editable ? (
                          <input
                            type="text"
                            className="players-table-input"
                            value={p.name}
                            onChange={(e) => onUpdatePlayer?.(p.id, 'name', e.target.value)}
                          />
                        ) : (
                          p.name
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <select
                            className="players-table-select"
                            value={p.role}
                            onChange={(e) => onUpdatePlayer?.(p.id, 'role', e.target.value)}
                          >
                            <option value="G">G</option>
                            <option value="A">A</option>
                            <option value="C">C</option>
                          </select>
                        ) : (
                          <span className="role-tag">{p.role}</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-tag ${p.status}`}>
                          {p.status === 'assigned' ? 'Assegnato' : 'Libero'}
                        </span>
                      </td>
                      <td>{owner ? getCoachDisplayName(owner) : '—'}</td>
                      {isAuctioneer && (
                        <td>
                          {editable && (
                            <button
                              type="button"
                              className="btn-setup-remove"
                              onClick={() => onRemovePlayer?.(p.id)}
                              disabled={players.length <= 1}
                              title="Rimuovi giocatore"
                              aria-label={`Rimuovi ${p.name}`}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'log' && (
          <div className="tab-content">
            <ul className="log-list full">
              {[...log].reverse().map((entry, i) => (
                <li key={`${entry.timestamp}-${i}`} className="log-item slide-in">
                  <span className="log-time">{formatTime(entry.timestamp)}</span>
                  <span className="log-text">{entry.text}</span>
                </li>
              ))}
              {log.length === 0 && <li className="muted">Nessun evento registrato</li>}
            </ul>
          </div>
        )}
      </section>
      {showAddPlayerModal && (
        <AddPlayerModal
          onConfirm={(fields) => {
            onAddPlayer?.(fields);
            setShowAddPlayerModal(false);
          }}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}
    </div>
  );
}
