import { useEffect, useRef, useState } from 'react';
import { getCoachDisplayName, isMobileDevice } from './asta-setup.js';

export function useAssignmentFlash({
  phase,
  currentPlayer,
  currentBid,
  currentBidder,
  coaches,
  announceVoice = false,
}) {
  const [flash, setFlash] = useState(null);
  const seenRef = useRef(null);

  useEffect(() => {
    if (phase !== 'settled' || !currentPlayer?.id) {
      if (phase !== 'settled') seenRef.current = null;
      return undefined;
    }

    const sold = Boolean(currentBidder && currentBid > 0);
    const key = sold
      ? `${currentPlayer.id}:sold:${currentBidder}:${currentBid}`
      : `${currentPlayer.id}:unsold`;

    if (seenRef.current === key) return undefined;
    seenRef.current = key;

    const playerName = currentPlayer.name;

    if (!sold) {
      if (announceVoice && !isMobileDevice() && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(
          `${playerName} non è stato assegnato a nessuno`,
        );
        msg.lang = 'it-IT';
        window.speechSynthesis.speak(msg);
      }
      return undefined;
    }

    const coach = coaches.find((c) => c.id === currentBidder);
    const coachName = getCoachDisplayName(coach);

    setFlash({ playerName, coachName, bid: currentBid, exiting: false });

    if (announceVoice && !isMobileDevice() && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(
        `${playerName} va a ${coachName} per ${currentBid} crediti`,
      );
      msg.lang = 'it-IT';
      window.speechSynthesis.speak(msg);
    }

    const exitAt = setTimeout(
      () => setFlash((prev) => (prev ? { ...prev, exiting: true } : null)),
      2500,
    );
    const hideAt = setTimeout(() => setFlash(null), 3000);

    return () => {
      clearTimeout(exitAt);
      clearTimeout(hideAt);
    };
  }, [phase, currentPlayer, currentBid, currentBidder, coaches, announceVoice]);

  return flash;
}

export function AssignmentFlashOverlay({ flash }) {
  if (!flash) return null;

  return (
    <div className="assignment-flash-backdrop" role="status" aria-live="assertive">
      <div
        className={`assignment-flash-card ${flash.exiting ? 'assignment-flash-out' : 'assignment-flash-in'}`}
      >
        <p className="assignment-flash-text">
          🏀 <strong>{flash.playerName}</strong> va a{' '}
          <strong>{flash.coachName}</strong> per{' '}
          <strong>{flash.bid}</strong> crediti!
        </p>
      </div>
    </div>
  );
}
