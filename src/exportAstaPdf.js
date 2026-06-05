import { jsPDF } from 'jspdf';
import { INITIAL_BUDGET, BANDITORE_COACH_ID, getCoachDisplayName } from './asta-setup.js';

const PAGE_BOTTOM = 280;
const MARGIN = 14;
const LINE = 6;

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResultCoaches(coaches) {
  return (coaches || [])
    .filter((c) => c.id !== BANDITORE_COACH_ID && c.players?.length > 0)
    .map((c) => {
      const spent = INITIAL_BUDGET - c.budget;
      const avgRating = c.players.length
        ? c.players.reduce((sum, p) => sum + (p.price || 0), 0) / c.players.length
        : 0;
      return { ...c, spent, avgRating };
    });
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage();
    return MARGIN + 4;
  }
  return y;
}

function writeLines(doc, text, x, y, maxWidth) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line) => {
    y = ensureSpace(doc, y, LINE);
    doc.text(line, x, y);
    y += LINE;
  });
  return y;
}

export function isAuctionComplete(players, phase, isRunning) {
  if (!players?.length) return false;
  const hasAvailable = players.some((p) => p.status === 'available');
  if (hasAvailable) return false;
  return !(phase === 'live' && isRunning);
}

export function buildCoachRankings(coaches) {
  return getResultCoaches(coaches)
    .sort((a, b) => b.avgRating - a.avgRating || b.spent - a.spent);
}

export function exportAstaPdf({ stanzaCode, coaches, log = [] }) {
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
  let y = MARGIN + 4;

  const startTs = log[0]?.timestamp ?? Date.now();
  const endTs = log[log.length - 1]?.timestamp ?? Date.now();
  const rankings = buildCoachRankings(coaches);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  y = writeLines(doc, `ASTA TORNEO BASKET - ${stanzaCode || 'STANZA'}`, MARGIN, y, width) + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y = writeLines(doc, `Inizio asta: ${formatDateTime(startTs)}`, MARGIN, y, width);
  y = writeLines(doc, `Fine asta: ${formatDateTime(endTs)}`, MARGIN, y, width);
  y += 6;

  rankings.forEach((coach) => {
    y = ensureSpace(doc, y, LINE * 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    y = writeLines(doc, getCoachDisplayName(coach), MARGIN, y, width);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y = writeLines(doc, `Budget rimasto: ${coach.budget} cr.  ·  Totale speso: ${coach.spent} cr.`, MARGIN, y, width);
    y = writeLines(doc, `Rating medio: ${coach.avgRating.toFixed(1)} cr./giocatore`, MARGIN, y, width);

    if (coach.players.length === 0) {
      y = writeLines(doc, 'Nessun giocatore acquistato.', MARGIN + 4, y, width - 4);
    } else {
      coach.players.forEach((p) => {
        y = ensureSpace(doc, y, LINE);
        doc.text(`• ${p.name}  (${p.role})  —  ${p.price} cr.`, MARGIN + 4, y);
        y += LINE;
      });
    }
    y += 4;
  });

  y = ensureSpace(doc, y, LINE * (rankings.length + 4));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  y = writeLines(doc, 'Classifica finale per rating medio', MARGIN, y, width) + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  rankings.forEach((coach, i) => {
    y = ensureSpace(doc, y, LINE);
    doc.text(
      `${i + 1}. ${getCoachDisplayName(coach)} — ${coach.avgRating.toFixed(1)} cr./gioc. (${coach.players.length} gioc.)`,
      MARGIN,
      y,
    );
    y += LINE;
  });

  doc.save('asta-torneo.pdf');
}
