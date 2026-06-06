import { useState } from 'react';
import {
  getCoachColor,
  INITIAL_BUDGET,
  AUCTION_SECONDS,
  loadSetup,
  saveSetup,
  splitPlayerName,
  createSetupPlayer,
  getDemoSetup,
  getEmptySetup,
  getAppBaseUrl,
  buildShareInviteMessage,
  isMobileDevice,
  isBanditoreRole,
  getCoachDisplayName,
  getJoinedCoaches,
  BANDITORE_COACH_ID,
  BANDITORE_PASSWORD,
} from './asta-setup.js';
import { useAuctionBeep, useBidSound, usePlayerStartSound, useCoachJoinAlert, playBidFeedback, URGENT_TIMER_SECONDS } from './useAuctionBeep.js';
import { FullscreenToggle } from './useFullscreen.jsx';
import { useMobileViewportLock } from './useMobileViewportLock.js';
import { AssignmentFlashOverlay, useAssignmentFlash } from './useAssignmentFlash.jsx';
import { BasketballIcon } from './BasketballDecor.jsx';
import { buildCoachRankings, exportAstaPdf, exportRostersPdf } from './exportAstaPdf.js';
import { getPlayerInitials, getPlayerAvatarColor, readPlayerPhotoFile } from './playerPhoto.js';
import {
  ROSTER_SLOTS,
  buildBidOptions,
  buildMobileBidOptions,
  getMaxBidAmount,
  isBudgetMinimum,
  isInBudgetReserve,
} from './asta-budget.js';

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
      <rect x="20" y="20" width="900" height="460" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <line x1="470" y1="20" x2="470" y2="480" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <circle cx="470" cy="250" r="70" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <rect x="20" y="160" width="190" height="180" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <rect x="730" y="160" width="190" height="180" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <g className="court-bballs" opacity="0.35">
        <circle cx="120" cy="90" r="28" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeWidth="1" />
        <path d="M120 62 v56 M92 90 h56" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="820" cy="410" r="22" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeWidth="1" />
        <path d="M820 388 v44 M798 410 h44" stroke="currentColor" strokeWidth="0.8" />
      </g>
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

export function PlayerAvatar({ player, size = 'md', className = '' }) {
  const initials = getPlayerInitials(player?.name);
  const bg = getPlayerAvatarColor(player?.id);
  const cls = `player-avatar player-avatar-${size}${className ? ` ${className}` : ''}`;

  if (player?.photo) {
    return <img src={player.photo} alt="" className={cls} />;
  }

  return (
    <span className={`${cls} player-avatar-initials`} style={{ background: bg }} aria-hidden="true">
      {initials}
    </span>
  );
}

function SetupPhotoButton({ player, onPhoto, onRemove }) {
  const inputId = `setup-photo-${player.id}`;

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const photo = await readPlayerPhotoFile(file);
      onPhoto(photo);
    } catch {
      /* ignore invalid image */
    }
  };

  return (
    <div className="setup-photo-cell">
      <PlayerAvatar player={player} size="xs" />
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="setup-photo-input"
        onChange={handleChange}
      />
      <label htmlFor={inputId} className="setup-photo-btn" title="Carica foto">
        Foto
      </label>
      {player.photo && (
        <button
          type="button"
          className="setup-photo-clear"
          onClick={onRemove}
          title="Rimuovi foto"
          aria-label={`Rimuovi foto ${player.name}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function JerseyCard({ player, currentBid, leadingCoachId, timer, phase, winnerName }) {
  if (!player) {
    return (
      <div className="jersey-card jersey-empty">
        <BasketballIcon className="jersey-empty-ball" size={56} />
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
        <div className="jersey-avatar-wrap">
          <PlayerAvatar player={player} size="xl" />
        </div>
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
  const budgetMin = isBudgetMinimum(coach);

  return (
    <li
      className={`coach-card ${isLeading ? 'leading' : ''} ${isOffline ? 'offline' : ''} ${budgetMin ? 'budget-minimum' : ''}`}
    >
      <div className="coach-card-head">
        <span className="coach-num" style={{ '--coach-color': getCoachColor(coach.id) }}>{coach.id}</span>
        <div className="coach-card-info">
          <span className="coach-name">{displayName}</span>
          <span className="coach-budget">{coach.budget} cr. rimasti</span>
        </div>
        <span className="coach-pill">{coach.players.length} gioc.</span>
        {budgetMin && <span className="coach-budget-min-badge">Budget minimo</span>}
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

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FinalResultsScreen({
  stanzaCode,
  coaches,
  log,
  onClose,
  onChangeCoach,
}) {
  const rankings = buildCoachRankings(coaches);
  const startTs = log[0]?.timestamp ?? Date.now();
  const endTs = log[log.length - 1]?.timestamp ?? Date.now();

  const handleExport = () => {
    exportAstaPdf({ stanzaCode, coaches, log });
  };

  return (
    <div className="app dash final-results">
      <header className="dash-header">
        <div className="dash-brand">
          <div className="arena-line" />
          <h1 className="arena-title">{APP_TITLE}</h1>
          <div className="arena-line" />
        </div>
        <p className="dash-subtitle final-results-title">
          ASTA TORNEO BASKET — {stanzaCode || 'STANZA'}
        </p>
        <p className="room-hint muted">
          {formatDateTime(startTs)} → {formatDateTime(endTs)}
        </p>
      </header>

      <section className="final-results-actions">
        <button type="button" className="btn-cta" onClick={handleExport}>
          Scarica PDF
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Torna alla dashboard
        </button>
        {!isMobileDevice() && <FullscreenToggle className="btn-secondary btn-fullscreen" />}
        <button type="button" className="btn-ghost" onClick={onChangeCoach}>
          Esci
        </button>
      </section>

      <section className="dash-panel final-ranking-panel">
        <h2 className="panel-title">Classifica per rating medio</h2>
        <p className="setup-note muted">Rating = media crediti spesi per giocatore acquistato</p>
        <ol className="final-ranking-list">
          {rankings.map((c, i) => (
            <li key={c.id} className="final-ranking-item">
              <span className="final-rank">{i + 1}</span>
              <span className="coach-num sm" style={{ '--coach-color': getCoachColor(c.id) }}>{c.id}</span>
              <span className="final-rank-name">{getCoachDisplayName(c)}</span>
              <span className="final-rank-score">{c.avgRating.toFixed(1)} cr./gioc.</span>
            </li>
          ))}
          {rankings.length === 0 && <li className="muted">Nessun allenatore con giocatori assegnati.</li>}
        </ol>
      </section>

      <div className="final-coaches-grid">
        {rankings.map((c) => (
          <section key={c.id} className="dash-panel final-coach-card" style={{ '--coach-color': getCoachColor(c.id) }}>
            <div className="panel-head">
              <h2 className="panel-title">{getCoachDisplayName(c)}</h2>
              <span className="coach-num sm">{c.id}</span>
            </div>
            <div className="final-coach-stats">
              <span>Budget rimasto: <strong>{c.budget} cr.</strong></span>
              <span>Totale speso: <strong>{c.spent} cr.</strong></span>
              <span>Rating medio: <strong>{c.avgRating.toFixed(1)}</strong></span>
            </div>
            <ul className="final-roster-list">
              {c.players.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className="muted">{p.role} · {p.price} cr.</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function BanditoreEntryScreen({ defaultStanza = '', onJoin }) {
  const [stanza, setStanza] = useState(defaultStanza);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    const stanzaNorm = stanza.trim().toUpperCase();
    if (!stanzaNorm) {
      setError('Inserisci il codice stanza.');
      return;
    }
    if (password !== BANDITORE_PASSWORD) {
      setError('Password banditore non valida.');
      return;
    }
    setError('');
    onJoin({ stanza: stanzaNorm, name: 'Banditore', role: 'banditore' });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin();
  };

  const canSubmit = stanza.trim() && password;

  return (
    <div className="app dash">
      <header className="dash-header">
        <div className="dash-brand">
          <div className="arena-line" />
          <h1 className="arena-title">{APP_TITLE}</h1>
          <div className="arena-line" />
        </div>
        <p className="dash-subtitle">Accesso banditore — dashboard asta</p>
      </header>

      <div className="room-entry room-entry-banditore room-entry-unified">
        <p className="room-hint muted">
          Gli allenatori entrano solo dal link che invii dal Setup
        </p>

        <label className="room-label" htmlFor="banditore-stanza">Codice stanza</label>
        <input
          id="banditore-stanza"
          type="text"
          className="room-input"
          placeholder="es. TORNEO2025"
          value={stanza}
          onChange={(e) => setStanza(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoFocus
        />

        <label className="room-label" htmlFor="banditore-password">Password banditore</label>
        <input
          id="banditore-password"
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

        {error && (
          <p className="room-password-alert alert" role="alert">{error}</p>
        )}

        <button
          type="button"
          className="btn-cta btn-cta-lg room-enter-btn"
          disabled={!canSubmit}
          onClick={handleJoin}
        >
          ENTRA COME BANDITORE
        </button>

        <div className="room-fullscreen-row">
          <FullscreenToggle className="btn-secondary btn-fullscreen" />
          <span className="muted room-fullscreen-hint">Esc per uscire dallo schermo intero</span>
        </div>
      </div>
    </div>
  );
}

export function CoachEntryScreen({ defaultStanza = '', onJoin }) {
  const [stanza, setStanza] = useState(defaultStanza);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    const stanzaNorm = stanza.trim().toUpperCase();
    const nameTrim = name.trim();
    if (!stanzaNorm || !nameTrim) {
      setError('Compila codice stanza e il tuo nome.');
      return;
    }
    setError('');
    onJoin({ stanza: stanzaNorm, name: nameTrim, role: 'coach' });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin();
  };

  const canSubmit = stanza.trim() && name.trim();

  useMobileViewportLock();

  return (
    <div className="app mobile-coach mobile-coach-fixed">
      <p className="mobile-app-brand mobile-app-brand-center">{APP_TITLE}</p>
      <div className="mobile-coach-header">
        <h2 className="mobile-coach-title">Entra in asta</h2>
        <p className="mobile-coach-sub">Inserisci codice stanza e il tuo nome</p>
      </div>

      <div className="mobile-entry-form">
        <label className="room-label" htmlFor="coach-stanza">Codice stanza</label>
        <input
          id="coach-stanza"
          type="text"
          className="mobile-name-input"
          placeholder="es. TORNEO2025"
          value={stanza}
          onChange={(e) => setStanza(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        <label className="room-label" htmlFor="coach-name">Il tuo nome</label>
        <input
          id="coach-name"
          type="text"
          className="mobile-name-input"
          placeholder="es. Marco"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="name"
        />

        {error && (
          <p className="room-password-alert alert" role="alert">{error}</p>
        )}

        <button
          type="button"
          className="btn-cta btn-cta-lg"
          disabled={!canSubmit}
          onClick={handleJoin}
        >
          ENTRA
        </button>
      </div>

      <p className="mobile-invite-hint muted">
        Usa il link inviato dal banditore. Deve aver già aperto la stanza sul PC.
      </p>
    </div>
  );
}

/** @deprecated Usa BanditoreEntryScreen o CoachEntryScreen */
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
  useMobileViewportLock();

  return (
    <div className="app mobile-coach mobile-coach-fixed">
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
  useMobileViewportLock();

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

  const bidAmounts = buildMobileBidOptions(currentBid);
  const maxBid = getMaxBidAmount(myCoach);
  const inReserve = isInBudgetReserve(myCoach);

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

  const assignmentFlash = useAssignmentFlash({
    phase,
    currentPlayer,
    currentBid,
    currentBidder,
    coaches,
  });

  return (
    <div className="app mobile-coach mobile-coach-fixed">
      <AssignmentFlashOverlay flash={assignmentFlash} />
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
        {isBudgetMinimum(myCoach) && (
          <span className="coach-budget-min-badge mobile">Budget minimo</span>
        )}
        <p className="mobile-coach-budget">{myCoach?.budget ?? 0} crediti disponibili</p>
      </header>

      {bidError && <div className="alert mobile-alert">{bidError}</div>}

      <section className="mobile-stage">
        {currentPlayer && <BasketballIcon className="mobile-stage-ball" size={48} />}
        {currentPlayer ? (
          <>
            <p className="mobile-player-label">{isSettled ? 'Asta chiusa' : 'In asta'}</p>
            <div className="mobile-player-avatar">
              <PlayerAvatar player={currentPlayer} size="lg" />
            </div>
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
            <BasketballIcon className="mobile-waiting-ball" size={52} />
            <p className="mobile-waiting-title">Nessuno in asta</p>
            <p className="muted">Attendi il prossimo giocatore</p>
          </div>
        )}
        <p className={`mobile-status ${isLive ? 'live' : ''} ${isSettled ? 'settled' : ''}`}>{statusText}</p>
      </section>

      {isLive && currentPlayer && myCoach && (
        <>
          {inReserve && maxBid >= Math.max(currentBid + 1, 1) && (
            <p className="budget-reserve-hint mobile-budget-reserve">
              Puoi offrire massimo <strong>{maxBid}</strong> crediti
            </p>
          )}
          <div className="mobile-bid-row">
            {bidAmounts.map(({ label, amount }) => {
              const disabled = amount > maxBid;
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
                </button>
              );
            })}
          </div>
        </>
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

export function SetupScreen({ onSave, onClose, stanzaCode = '', gamePlayers = [] }) {
  const [draft, setDraft] = useState(() => {
    const setup = loadSetup();
    return {
      ...setup,
      players: setup.players.map((p) => {
        const gp = gamePlayers.find((g) => g.id === p.id);
        return gp?.photo ? { ...p, photo: gp.photo } : p;
      }),
    };
  });
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  const updatePlayer = (id, field, value) => {
    setDraft((d) => ({
      ...d,
      players: d.players.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const setPlayerPhoto = (id, photo) => {
    setDraft((d) => ({
      ...d,
      players: d.players.map((p) => (p.id === id ? { ...p, photo } : p)),
    }));
  };

  const clearPlayerPhoto = (id) => {
    setDraft((d) => ({
      ...d,
      players: d.players.map((p) => {
        if (p.id !== id) return p;
        const { photo, ...rest } = p;
        return rest;
      }),
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
    setDraft((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }));
  };

  const loadDemo = () => {
    const demo = getDemoSetup();
    setDraft(demo);
    saveSetup(demo);
    onSave(demo);
  };

  const clearAllPlayers = () => {
    if (!window.confirm(
      'Eliminare tutti i giocatori dalla lista?\n\nDovrai aggiungerli di nuovo manualmente o usare Demo.',
    )) return;
    const empty = getEmptySetup();
    setDraft(empty);
    saveSetup(empty);
    onSave(empty);
  };

  const handleSave = () => {
    saveSetup(draft);
    onSave(draft);
  };

  return (
    <div className="app dash setup-screen">
      <ArenaHeader
        meta={<span className="pill">Configurazione torneo</span>}
        onChangeCoach={onClose}
      />
      <div className="setup-grid setup-grid-single">
        <section className="dash-panel setup-players-panel">
          <div className="panel-head setup-players-head">
            <h2 className="panel-title">Giocatori in asta</h2>
            <span className="panel-count">{draft.players.length} totali</span>
          </div>
          <div className="setup-players-toolbar">
            <button type="button" className="btn-secondary" onClick={() => setShowAddPlayerModal(true)}>
              + Aggiungi giocatore
            </button>
            <button type="button" className="btn-secondary setup-demo-btn" onClick={loadDemo}>
              Demo
            </button>
            {draft.players.length > 0 && (
              <button type="button" className="btn-secondary setup-clear-btn" onClick={clearAllPlayers}>
                Elimina tutti i giocatori
              </button>
            )}
          </div>
          <p className="setup-note muted">
            Lista vuota all&apos;inizio. Aggiungi i giocatori uno a uno, oppure Demo per 16 giocatori finti.
          </p>
          <ul className="setup-list players">
            {draft.players.length === 0 && (
              <li className="setup-empty muted">Nessun giocatore — usa + Aggiungi giocatore o Demo.</li>
            )}
            {draft.players.map((p) => (
              <li key={p.id}>
                <span className="player-id">#{p.id}</span>
                <SetupPhotoButton
                  player={p}
                  onPhoto={(photo) => setPlayerPhoto(p.id, photo)}
                  onRemove={() => clearPlayerPhoto(p.id)}
                />
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
  stanzaCode = '',
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
  onLoadDemo,
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
  const [joinBanner, setJoinBanner] = useState(null);

  const isAuctioneer = isBanditoreRole(coachId);
  const joinedCoaches = getJoinedCoaches(coaches);
  const myCoach = isAuctioneer ? null : coaches.find((c) => c.id === coachId);
  const availablePlayers = players.filter((p) => p.status === 'available');
  const assignedPlayers = players.filter((p) => p.status === 'assigned');
  const leadingCoach = coaches.find((c) => c.id === currentBidder);
  const myColor = isAuctioneer ? '#D4AF37' : getCoachColor(coachId);
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

  const handleExportRosters = () => {
    exportRostersPdf({ stanzaCode, coaches });
  };

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
    currentPlayerName: currentPlayer?.name,
    phase,
    isRunning,
    currentBid,
    timer,
    maxTimer: AUCTION_SECONDS,
    announceVoice: isAuctioneer && !isMobileDevice(),
  });

  useCoachJoinAlert({
    log,
    enabled: isAuctioneer,
    announceVoice: isAuctioneer && !isMobileDevice(),
    onJoin: (name) => {
      setJoinBanner(name);
      window.setTimeout(() => setJoinBanner(null), 6000);
    },
  });

  const assignmentFlash = useAssignmentFlash({
    phase,
    currentPlayer,
    currentBid,
    currentBidder,
    coaches,
    announceVoice: isAuctioneer && !isMobileDevice(),
  });

  const bidAmounts = buildBidOptions(currentBid, myCoach).options;
  const maxBid = myCoach ? getMaxBidAmount(myCoach) : 0;
  const inReserve = myCoach ? isInBudgetReserve(myCoach) : false;

  const auctioneerActions = isAuctioneer && (
    <>
      <button type="button" className="btn-cta" onClick={onOpenSetup}>Setup</button>
      {isPaused ? (
        <button type="button" className="btn-cta" onClick={onStartAuction}>Riprendi</button>
      ) : !isSettled && (
        <button
          type="button"
          className="btn-cta"
          onClick={onStartAuction}
          disabled={phase === 'live'}
        >
          Avvia
        </button>
      )}
      <button type="button" className="btn-secondary" onClick={onStopAuction} disabled={!isLive}>Pausa</button>
      <button type="button" className="btn-secondary" onClick={onNextPlayer} disabled={isSettled}>Salta</button>
      <button type="button" className="btn-secondary" onClick={onManualAssign} disabled={!isLive || !currentPlayer}>Assegna</button>
      <button type="button" className="btn-secondary" onClick={onLoadDemo} disabled={isLive}>Demo</button>
      <button type="button" className="btn-secondary" onClick={onInitSetup}>Reset</button>
      {isSettled && (
        <button type="button" className="btn-cta btn-confirm-toolbar" onClick={onConfirmNext} disabled={!canConfirmNext}>
          Conferma prossimo
        </button>
      )}
    </>
  );

  return (
    <div className="app dash">
      <AssignmentFlashOverlay flash={assignmentFlash} />
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

      {joinBanner && (
        <div className="coach-join-banner" role="status">
          {joinBanner} si è unito all&apos;asta
        </div>
      )}

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
              <>
                {inReserve && maxBid >= Math.max(currentBid + 1, 1) && (
                  <p className="budget-reserve-hint">
                    Puoi offrire massimo <strong>{maxBid}</strong> crediti
                  </p>
                )}
                <div className="bid-row">
                  {bidAmounts.map(({ label, amount }) => {
                    const disabled = amount > maxBid;
                    return (
                      <button
                        key={`${label}-${amount}`}
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
              </>
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
                <li key={c.id} className={`${c.online ? 'online' : 'offline'}${isBudgetMinimum(c) ? ' budget-minimum' : ''}`}>
                  <span className="coach-num sm" style={{ '--coach-color': getCoachColor(c.id) }}>{c.id}</span>
                  <span className="admin-coach-name">{getCoachDisplayName(c)}</span>
                  <span className="admin-coach-budget">{c.budget} cr.</span>
                  {isBudgetMinimum(c) && (
                    <span className="coach-budget-min-badge sm">Budget minimo</span>
                  )}
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
        <div className="tabs-panel-head">
          <TabBar active={activeTab} onChange={setActiveTab} />
          {activeTab === 'rosters' && (
            <button
              type="button"
              className="btn-cta btn-export-rosters"
              onClick={handleExportRosters}
              disabled={joinedCoaches.length === 0}
            >
              Scarica PDF rose
            </button>
          )}
        </div>

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
          <div className="tab-content">
            <div className="rosters-grid">
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
