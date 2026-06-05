import { useEffect, useRef } from 'react';

export const URGENT_TIMER_SECONDS = 5;

function getAudioContext(ref) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ref.current) ref.current = new Ctx();
  return ref.current;
}

const sharedCtxRef = { current: null };
let lastBidSoundAt = 0;
let lastPlayerStartSoundAt = 0;

function playBidSoundOnce(ctx) {
  const now = Date.now();
  if (now - lastBidSoundAt < 280) return;
  lastBidSoundAt = now;
  playBidSound(ctx);
}

function playTick(ctx, timer) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  // Più acuto man mano che scade il tempo
  osc.frequency.value = 520 + (URGENT_TIMER_SECONDS - timer) * 90;
  osc.type = 'square';

  const peak = timer <= 2 ? 0.22 : 0.14;
  gain.gain.setValueAtTime(peak, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

function playBidSound(ctx) {
  const t = ctx.currentTime;

  const playTone = (freq, start, duration, peak) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  // Doppio "ding" da asta — ben udibile su cellulare
  playTone(740, t, 0.12, 0.28);
  playTone(980, t + 0.1, 0.18, 0.32);
}

function playPlayerStartSound(ctx) {
  const t = ctx.currentTime;

  const playTone = (freq, start, duration, peak) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  // Fanfare ascendente — nuovo giocatore in asta
  playTone(420, t, 0.14, 0.24);
  playTone(560, t + 0.11, 0.14, 0.26);
  playTone(700, t + 0.22, 0.22, 0.28);
}

function playPlayerStartSoundOnce(ctx) {
  const now = Date.now();
  if (now - lastPlayerStartSoundAt < 400) return;
  lastPlayerStartSoundAt = now;
  playPlayerStartSound(ctx);
}

function runWithAudio(ctx, fn) {
  if (ctx.state === 'suspended') {
    ctx.resume().then(fn).catch(() => {});
  } else {
    fn();
  }
}

function vibrateTimerCountdown(t) {
  if (!navigator.vibrate) return;
  if (t === 5) navigator.vibrate([200, 100, 200]);
  if (t <= 3 && t > 0) navigator.vibrate(300);
  if (t === 0) navigator.vibrate([500, 100, 500, 100, 500]);
}

/** Beep ogni secondo negli ultimi 5s di asta live (tutti i client). */
export function useAuctionBeep({ timer, phase, isRunning, currentPlayerId }) {
  const lastTickRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    const isLive = phase === 'live' && isRunning && currentPlayerId;

    if (!isLive) {
      lastTickRef.current = null;
      return;
    }

    if (timer > URGENT_TIMER_SECONDS) {
      lastTickRef.current = null;
      return;
    }

    if (timer < 0 || lastTickRef.current === timer) return;
    lastTickRef.current = timer;

    vibrateTimerCountdown(timer);

    if (timer === 0) return;

    const ctx = getAudioContext(ctxRef);
    if (!ctx) return;

    runWithAudio(ctx, () => playTick(ctx, timer));
  }, [timer, phase, isRunning, currentPlayerId]);
}

/** Suono quando arriva un nuovo rilancio (tutti i client). */
export function useBidSound({ currentBid, currentBidder, phase, isRunning, currentPlayerId }) {
  const lastBidRef = useRef({ playerId: null, bid: 0, bidder: null });
  const ctxRef = useRef(null);

  useEffect(() => {
    const isLive = phase === 'live' && isRunning && currentPlayerId;

    if (!isLive) {
      lastBidRef.current = { playerId: null, bid: 0, bidder: null };
      return;
    }

    if (lastBidRef.current.playerId !== currentPlayerId) {
      lastBidRef.current = { playerId: currentPlayerId, bid: currentBid, bidder: currentBidder };
      return;
    }

    const isNewBid = currentBid > lastBidRef.current.bid
      || (currentBid > 0 && currentBidder !== lastBidRef.current.bidder);

    if (isNewBid && currentBid > 0) {
      const ctx = getAudioContext(ctxRef);
      if (ctx) runWithAudio(ctx, () => playBidSoundOnce(ctx));
    }

    lastBidRef.current = { playerId: currentPlayerId, bid: currentBid, bidder: currentBidder };
  }, [currentBid, currentBidder, phase, isRunning, currentPlayerId]);
}

/** Suono quando inizia l'asta di un nuovo giocatore (tutti i client). */
export function usePlayerStartSound({
  currentPlayerId,
  phase,
  isRunning,
  currentBid,
  timer,
  maxTimer = 15,
}) {
  const lastPlayerRef = useRef(null);
  const lastPhaseRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    const isLive = phase === 'live' && isRunning && currentPlayerId;
    const prevPlayer = lastPlayerRef.current;
    const prevPhase = lastPhaseRef.current;

    if (!isLive) {
      if (phase !== 'live') lastPlayerRef.current = null;
      lastPhaseRef.current = phase;
      return;
    }

    const freshRound = currentBid === 0 && timer >= maxTimer - 1;
    const playerChanged = prevPlayer !== null && prevPlayer !== currentPlayerId;
    const newPlayerCall = prevPlayer === null && freshRound;
    const restarted = prevPhase === 'settled' && freshRound;

    if (playerChanged || newPlayerCall || restarted) {
      const ctx = getAudioContext(ctxRef);
      if (ctx) runWithAudio(ctx, () => playPlayerStartSoundOnce(ctx));
    }

    lastPlayerRef.current = currentPlayerId;
    lastPhaseRef.current = phase;
  }, [currentPlayerId, phase, isRunning, currentBid, timer, maxTimer]);
}

function playCoachJoinSound(ctx) {
  const t = ctx.currentTime;

  const playTone = (freq, start, duration, peak) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  playTone(523, t, 0.16, 0.3);
  playTone(659, t + 0.14, 0.2, 0.32);
  playTone(784, t + 0.3, 0.28, 0.34);
}

let lastCoachJoinSoundAt = 0;

function playCoachJoinSoundOnce(ctx) {
  const now = Date.now();
  if (now - lastCoachJoinSoundAt < 500) return;
  lastCoachJoinSoundAt = now;
  playCoachJoinSound(ctx);
}

function announceCoachJoin(name) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${name} si è unito all'asta`);
  utterance.lang = 'it-IT';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

/** Suono + voce quando un allenatore entra (banditore). */
export function useCoachJoinAlert({ log, enabled, announceVoice = false, onJoin }) {
  const seenRef = useRef(new Set());
  const readyRef = useRef(false);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!enabled || !Array.isArray(log)) return;

    if (!readyRef.current) {
      log.forEach((entry) => seenRef.current.add(entry.timestamp));
      readyRef.current = true;
      return;
    }

    log.forEach((entry) => {
      const match = entry.text.match(/^(.+) si è unito all'asta$/);
      if (!match || seenRef.current.has(entry.timestamp)) return;

      seenRef.current.add(entry.timestamp);
      const name = match[1].trim();
      const ctx = getAudioContext(ctxRef);
      if (ctx) runWithAudio(ctx, () => playCoachJoinSoundOnce(ctx));
      if (announceVoice) announceCoachJoin(name);
      onJoin?.(name);
    });
  }, [log, enabled, announceVoice, onJoin]);
}

/** Feedback immediato al tap del pulsante rilancio (prima della sync). */
export function playBidFeedback() {
  const ctx = getAudioContext(sharedCtxRef);
  if (!ctx) return;
  runWithAudio(ctx, () => playBidSoundOnce(ctx));
}
