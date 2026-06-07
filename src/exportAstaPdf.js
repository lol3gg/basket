import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { INITIAL_BUDGET, BANDITORE_COACH_ID, getCoachDisplayName, getJoinedCoaches, ROSTER_SLOTS, buildRosterSlotList } from './asta-setup.js';

const PDF_ORANGE = [232, 82, 42];
const PDF_DARK = [18, 18, 18];
const PDF_MUTED = [120, 120, 120];
const MARGIN = 14;

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const pageWidth = doc.internal.pageSize.getWidth();
  const endTs = log[log.length - 1]?.timestamp ?? Date.now();
  const stanza = (stanzaCode || 'STANZA').trim().toUpperCase();
  const rankings = buildCoachRankings(coaches);

  let y = drawPdfHeader(
    doc,
    `ASTA TORNEO BASKET — ${stanza}`,
    formatDateTime(endTs),
  );

  rankings.forEach((coach) => {
    y = drawCoachRosterTable(doc, coach, y);
  });

  if (y > 230) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setFillColor(...PDF_DARK);
  doc.rect(MARGIN, y - 4, pageWidth - MARGIN * 2, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Classifica per rating medio squadra', MARGIN + 2, y + 2);
  y += 12;

  const rankRows = rankings.map((coach, i) => [
    String(i + 1),
    getCoachDisplayName(coach),
    coach.avgRating.toFixed(1),
    String(coach.players.length),
    String(coach.spent),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Allenatore', 'Rating medio', 'Giocatori', 'Speso']],
    body: rankRows.length ? rankRows : [['—', '—', '—', '—', '—']],
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    headStyles: {
      fillColor: PDF_ORANGE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: PDF_DARK,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    styles: {
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
  });

  doc.setTextColor(...PDF_MUTED);
  doc.setFontSize(8);
  doc.text(
    'Rating medio = crediti medi spesi per giocatore acquistato',
    MARGIN,
    doc.internal.pageSize.getHeight() - 8,
  );

  doc.save(`asta-${stanza}-${formatFileDate(endTs)}.pdf`);
}

function drawPdfHeader(doc, title, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_DARK);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, MARGIN, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, MARGIN, 26);
  return 46;
}

function drawCoachRosterTable(doc, coach, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;

  if (y > 250) {
    doc.addPage();
    y = MARGIN;
  }

  const spent = INITIAL_BUDGET - coach.budget;

  doc.setFillColor(...PDF_ORANGE);
  doc.rect(MARGIN, y - 5, pageWidth - MARGIN * 2, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(getCoachDisplayName(coach), MARGIN + 2, y + 2);
  y += 12;

  doc.setTextColor(...PDF_DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Budget rimasto: ${coach.budget} cr.`, MARGIN, y);
  doc.text(`Totale speso: ${spent} cr.`, MARGIN + 70, y);
  y += 8;

  const rows = buildRosterSlotList(coach.players).map((slot) => (
    slot.filled
      ? [slot.player.name, slot.player.role, String(slot.player.price)]
      : ['—', '—', '—']
  ));

  autoTable(doc, {
    startY: y,
    head: [['Giocatore', 'Ruolo', 'Prezzo']],
    body: rows,
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    headStyles: {
      fillColor: PDF_ORANGE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: PDF_DARK,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    styles: {
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
  });

  return doc.lastAutoTable.finalY + 10;
}

/** PDF con le rose di tutti gli allenatori (utilizzabile anche durante l'asta). */
export function exportRostersPdf({ stanzaCode, coaches }) {
  const doc = new jsPDF();
  const stanza = (stanzaCode || 'STANZA').trim().toUpperCase();
  const now = Date.now();
  const rosterCoaches = getJoinedCoaches(coaches).sort((a, b) => a.id - b.id);

  let y = drawPdfHeader(
    doc,
    `ROSE ALLENATORI — ${stanza}`,
    formatDateTime(now),
  );

  if (rosterCoaches.length === 0) {
    doc.setTextColor(...PDF_DARK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Nessun allenatore connesso.', MARGIN, y);
  } else {
    rosterCoaches.forEach((coach) => {
      y = drawCoachRosterTable(doc, coach, y);
    });
  }

  doc.save(`rose-${stanza}-${formatFileDate(now)}.pdf`);
}
