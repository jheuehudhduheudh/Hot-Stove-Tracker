// Broadcast-Quality 1200x675 Shareable PNG Card Generator (Zero External Dependencies)

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadCorsImage(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
}

function getStatcastColor(val) {
  const n = Number(val);
  if (n >= 90) return '#e11d48'; // elite red
  if (n >= 70) return '#f97316'; // above avg orange
  if (n >= 45) return '#71717a'; // average neutral
  if (n >= 25) return '#60a5fa'; // below avg cool blue
  return '#2563eb';              // cold blue
}

function slugify(str) {
  return String(str || 'player')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function drawAvatarMedallion(ctx, img, x, y, size, teamColor, initials, jerseyNumber) {
  ctx.save();
  roundRectPath(ctx, x, y, size, size, 16);
  ctx.fillStyle = '#18181b';
  ctx.fill();
  ctx.clip();

  if (img) {
    try {
      const ratio = Math.max(size / img.width, size / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    } catch {
      // Fall through to initials if drawing fails
      img = null;
    }
  }

  if (!img) {
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, teamColor || '#27272a');
    grad.addColorStop(1, '#111113');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(size * 0.34)}px "Plus Jakarta Sans", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(jerseyNumber ? `#${jerseyNumber}` : initials || 'MLB', x + size / 2, y + size / 2 + 2);
  }
  ctx.restore();

  // Crisp border around medallion
  roundRectPath(ctx, x, y, size, size, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawFooter(ctx, W, H, rightNote = 'MLB Stats API • Baseball Savant') {
  ctx.fillStyle = '#111113';
  ctx.fillRect(0, H - 52, W, 52);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 52);
  ctx.lineTo(W, H - 52);
  ctx.stroke();

  // Small crimson accent bar
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(40, H - 34, 4, 16);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4f4f5';
  ctx.font = '800 14px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText('HOT STOVE TRACKER', 54, H - 26);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillText('hot-stove-tracker.vercel.app', 228, H - 26);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#71717a';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText(rightNote, W - 40, H - 26);
}

function fitText(ctx, text, maxWidth) {
  let str = String(text || '');
  if (ctx.measureText(str).width <= maxWidth) return str;
  while (str.length > 3 && ctx.measureText(`${str}…`).width > maxWidth) {
    str = str.slice(0, -1);
  }
  return `${str}…`;
}

export async function exportPlayerCardPng({
  playerStats,
  teamInfo,
  groupKey = 'hitting',
  latestSeasonRow = null,
  careerStat = null,
  savant = null,
}) {
  if (!playerStats) return;

  const W = 1200;
  const H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. Carbon Background
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);

  // 2. Team-Colored Editorial Hero Band
  const heroH = 200;
  const heroGrad = ctx.createLinearGradient(0, 0, W, heroH);
  heroGrad.addColorStop(0, teamInfo?.color || '#18181b');
  heroGrad.addColorStop(0.75, '#141418');
  heroGrad.addColorStop(1, '#0a0a0b');
  ctx.fillStyle = heroGrad;
  ctx.fillRect(0, 0, W, heroH);

  // Darken scrim for text contrast
  const scrim = ctx.createLinearGradient(0, 0, W, 0);
  scrim.addColorStop(0, 'rgba(0,0,0,0.42)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, heroH);

  // Oversized Watermark Abbr on right
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.font = '900 175px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamInfo?.abbr || 'MLB', W - 28, heroH / 2 + 12);
  ctx.restore();

  // Attempt CORS-safe headshot load
  const headshotUrl = playerStats.id
    ? `https://midfield.mlbstatic.com/v1/people/${playerStats.id}/spots/180`
    : null;
  const avatarImg = await loadCorsImage(headshotUrl);
  const initials = (playerStats.fullName || 'ML')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  drawAvatarMedallion(ctx, avatarImg, 44, 38, 124, teamInfo?.color, initials, playerStats.primaryNumber);

  // Player Name & Bio
  const textX = 194;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Club & Position pill
  const clubLabel = `${teamInfo?.name || 'MLB'}  •  ${playerStats.position || 'MLB'}${playerStats.primaryNumber ? `  •  #${playerStats.primaryNumber}` : ''}`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText(clubLabel.toUpperCase(), textX, 74);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(fitText(ctx, playerStats.fullName, 740), textX, 124);

  const bioParts = [
    playerStats.age ? `Age ${playerStats.age}` : null,
    playerStats.batSide && playerStats.pitchHand ? `B/T: ${playerStats.batSide}/${playerStats.pitchHand}` : null,
    playerStats.height && playerStats.weight ? `${playerStats.height}, ${playerStats.weight} lbs` : null,
    playerStats.mlbDebutDate ? `Debut ${String(playerStats.mlbDebutDate).slice(0, 4)}` : null,
  ].filter(Boolean);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText(bioParts.join('  •  '), textX, 156);

  // 3. Body Content: Left Column (Key Stats) + Right Column (Baseball Savant Percentiles)
  const isPitch = groupKey === 'pitching';
  const activeStat = latestSeasonRow?.stat || careerStat || {};
  const seasonTitle = latestSeasonRow
    ? `${latestSeasonRow.season} SEASON (${latestSeasonRow.team || teamInfo?.abbr || 'MLB'})`
    : 'CAREER MLB STATS';

  const primaryTiles = isPitch
    ? [
        { label: 'ERA', val: activeStat.era ?? '—' },
        { label: 'WHIP', val: activeStat.whip ?? '—' },
        { label: 'STRIKEOUTS', val: activeStat.strikeOuts ?? '—' },
        { label: 'INNINGS', val: activeStat.inningsPitched ?? '—' },
      ]
    : [
        { label: 'AVG', val: activeStat.avg ?? '—' },
        { label: 'HOME RUNS', val: activeStat.homeRuns ?? '—' },
        { label: 'RBI', val: activeStat.rbi ?? '—' },
        { label: 'OPS', val: activeStat.ops ?? '—' },
      ];

  const hasSavant = Boolean(savant?.available && savant?.percentiles?.length > 0);
  const leftX = 44;
  const leftW = hasSavant ? 535 : W - 88;
  const bodyY = 228;

  // Section header
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText(seasonTitle, leftX, bodyY);

  // 2x2 Stat Tiles
  const tileGap = 14;
  const tileW = (leftW - tileGap) / 2;
  const tileH = 104;

  primaryTiles.forEach((tile, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const tx = leftX + col * (tileW + tileGap);
    const ty = bodyY + 14 + row * (tileH + tileGap);

    roundRectPath(ctx, tx, ty, tileW, tileH, 12);
    ctx.fillStyle = '#111113';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#71717a';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(tile.label, tx + 18, ty + 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px "JetBrains Mono", monospace';
    ctx.fillText(String(tile.val), tx + 18, ty + 78);
  });

  // Career Summary Strip underneath 2x2 tiles
  const careerY = bodyY + 14 + 2 * tileH + tileGap + 16;
  roundRectPath(ctx, leftX, careerY, leftW, 114, 12);
  ctx.fillStyle = '#111113';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText('CAREER TOTALS', leftX + 18, careerY + 26);

  const careerItems = isPitch
    ? [
        { l: 'W-L', v: careerStat ? `${careerStat.wins ?? 0}-${careerStat.losses ?? 0}` : '—' },
        { l: 'ERA', v: careerStat?.era ?? '—' },
        { l: 'WHIP', v: careerStat?.whip ?? '—' },
        { l: 'SO', v: careerStat?.strikeOuts ?? '—' },
        { l: 'IP', v: careerStat?.inningsPitched ?? '—' },
      ]
    : [
        { l: 'G', v: careerStat?.gamesPlayed ?? '—' },
        { l: 'AVG', v: careerStat?.avg ?? '—' },
        { l: 'HR', v: careerStat?.homeRuns ?? '—' },
        { l: 'RBI', v: careerStat?.rbi ?? '—' },
        { l: 'OPS', v: careerStat?.ops ?? '—' },
      ];

  const cCellW = (leftW - 36) / careerItems.length;
  careerItems.forEach((ci, i) => {
    const cx = leftX + 18 + i * cCellW;
    ctx.fillStyle = '#71717a';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(ci.l, cx, careerY + 54);
    ctx.fillStyle = '#f4f4f5';
    ctx.font = '800 20px "JetBrains Mono", monospace';
    ctx.fillText(String(ci.v), cx, careerY + 86);
  });

  // 4. Right Column: Baseball Savant Percentiles
  if (hasSavant) {
    const rightX = leftX + leftW + 26;
    const rightW = W - rightX - 44;

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(`${savant.year || ''} BASEBALL SAVANT PERCENTILES`.trim(), rightX, bodyY);

    roundRectPath(ctx, rightX, bodyY + 14, rightW, 352, 12);
    ctx.fillStyle = '#111113';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.stroke();

    const pctList = savant.percentiles.slice(0, 7);
    const rowStep = 45;
    pctList.forEach((m, idx) => {
      const ry = bodyY + 46 + idx * rowStep;
      const val = Math.max(0, Math.min(100, Number(m.value) || 0));
      const barColor = getStatcastColor(val);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#d4d4d8';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText(fitText(ctx, m.label, 145), rightX + 18, ry);

      const barX = rightX + 174;
      const barW = rightW - 246;
      const barH = 12;
      roundRectPath(ctx, barX, ry - 10, barW, barH, 6);
      ctx.fillStyle = '#27272a';
      ctx.fill();

      const fillW = Math.max(10, (barW * val) / 100);
      roundRectPath(ctx, barX, ry - 10, fillW, barH, 6);
      ctx.fillStyle = barColor;
      ctx.fill();

      // Percentile badge circle
      const badgeX = rightX + rightW - 56;
      roundRectPath(ctx, badgeX, ry - 15, 38, 22, 11);
      ctx.fillStyle = barColor;
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 12px "JetBrains Mono", monospace';
      ctx.fillText(String(val), badgeX + 19, ry);
    });
  }

  drawFooter(ctx, W, H, `${playerStats.fullName} • MLB Profile Card`);
  downloadCanvas(canvas, `${slugify(playerStats.fullName)}-mlb-card.png`);
}

export async function exportCompareCardPng({
  playerA,
  playerB,
  teamA,
  teamB,
  statAObj,
  statBObj,
  metricRows,
  winsA,
  winsB,
  ties,
  isPitchCmp,
}) {
  if (!playerA || !playerB) return;

  const W = 1200;
  const H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. Carbon Background
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);

  // 2. Dual-Team Split Header Banner
  const heroH = 178;
  const gradA = ctx.createLinearGradient(0, 0, W / 2, heroH);
  gradA.addColorStop(0, teamA?.color || '#27272a');
  gradA.addColorStop(1, '#111113');
  ctx.fillStyle = gradA;
  ctx.fillRect(0, 0, W / 2, heroH);

  const gradB = ctx.createLinearGradient(W, 0, W / 2, heroH);
  gradB.addColorStop(0, teamB?.color || '#27272a');
  gradB.addColorStop(1, '#111113');
  ctx.fillStyle = gradB;
  ctx.fillRect(W / 2, 0, W / 2, heroH);

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, W, heroH);

  const [imgA, imgB] = await Promise.all([
    loadCorsImage(playerA.id ? `https://midfield.mlbstatic.com/v1/people/${playerA.id}/spots/180` : null),
    loadCorsImage(playerB.id ? `https://midfield.mlbstatic.com/v1/people/${playerB.id}/spots/180` : null),
  ]);

  const initA = (playerA.fullName || 'A').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const initB = (playerB.fullName || 'B').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  drawAvatarMedallion(ctx, imgA, 40, 38, 102, teamA?.color, initA, playerA.primaryNumber);
  drawAvatarMedallion(ctx, imgB, W - 142, 38, 102, teamB?.color, initB, playerB.primaryNumber);

  // Player A Text (Left)
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText(`${teamA?.abbr || 'MLB'} • ${playerA.position || ''} • ${statAObj?.label || ''}`, 160, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(fitText(ctx, playerA.fullName, 360), 160, 106);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText(`Age ${playerA.age || '—'}  •  ${winsA} categories won`, 160, 134);

  // Player B Text (Right)
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText(`${statBObj?.label || ''} • ${playerB.position || ''} • ${teamB?.abbr || 'MLB'}`, W - 160, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(fitText(ctx, playerB.fullName, 360), W - 160, 106);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText(`${winsB} categories won  •  Age ${playerB.age || '—'}`, W - 160, 134);

  // Center VS Pill
  roundRectPath(ctx, W / 2 - 28, heroH / 2 - 22, 56, 44, 10);
  ctx.fillStyle = '#0a0a0b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f87171';
  ctx.font = '800 15px "JetBrains Mono", monospace';
  ctx.fillText('VS', W / 2, heroH / 2);

  // 3. Head-to-Head Metrics Table (Top 7 key metrics)
  const preferredKeys = isPitchCmp
    ? ['era', 'whip', 'wins', 'inningsPitched', 'strikeOuts', 'strikeoutsPer9Inn', 'saves']
    : ['avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'stolenBases'];

  const selectedRows = preferredKeys
    .map((k) => metricRows.find((r) => r.key === k))
    .filter(Boolean);
  const rowsToDraw = selectedRows.length >= 5 ? selectedRows : metricRows.slice(0, 7);

  const tableX = 44;
  const tableY = 204;
  const tableW = W - 88;
  const tableH = 394;

  roundRectPath(ctx, tableX, tableY, tableW, tableH, 12);
  ctx.fillStyle = '#111113';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const rowH = tableH / rowsToDraw.length;
  rowsToDraw.forEach((row, idx) => {
    const ry = tableY + idx * rowH;
    const midY = ry + rowH / 2;

    if (idx > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(tableX + 20, ry);
      ctx.lineTo(tableX + tableW - 20, ry);
      ctx.stroke();
    }

    // Center Metric Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText(row.label.toUpperCase(), W / 2, midY);

    // Player A Value (Left)
    ctx.textAlign = 'left';
    ctx.fillStyle = row.winner === 'A' ? '#34d399' : '#e4e4e7';
    ctx.font = `${row.winner === 'A' ? '800' : '600'} 22px "JetBrains Mono", monospace`;
    ctx.fillText(String(row.rawA ?? '—'), tableX + 36, midY);

    // Player B Value (Right)
    ctx.textAlign = 'right';
    ctx.fillStyle = row.winner === 'B' ? '#34d399' : '#e4e4e7';
    ctx.font = `${row.winner === 'B' ? '800' : '600'} 22px "JetBrains Mono", monospace`;
    ctx.fillText(String(row.rawB ?? '—'), tableX + tableW - 36, midY);

    // Subtle bar indicators toward center
    if (row.winner === 'A') {
      roundRectPath(ctx, tableX + 16, midY - 12, 5, 24, 3);
      ctx.fillStyle = '#34d399';
      ctx.fill();
    } else if (row.winner === 'B') {
      roundRectPath(ctx, tableX + tableW - 21, midY - 12, 5, 24, 3);
      ctx.fillStyle = '#34d399';
      ctx.fill();
    }
  });

  const verdict =
    winsA > winsB
      ? `${playerA.fullName} leads ${winsA}–${winsB}${ties ? ` (${ties} tied)` : ''}`
      : winsB > winsA
      ? `${playerB.fullName} leads ${winsB}–${winsA}${ties ? ` (${ties} tied)` : ''}`
      : `Dead even ${winsA}–${winsB}`;

  drawFooter(ctx, W, H, `${verdict} • Head-to-Head Comparison`);
  downloadCanvas(canvas, `${slugify(playerA.fullName)}-vs-${slugify(playerB.fullName)}.png`);
}


const RARITY_CANVAS_STYLES = {
  OBSIDIAN_1: {
    label: '1/1 OBSIDIAN EDITION',
    border: '#ef4444',
    topBg: '#1c0a0d',
    bottomBg: '#09090b',
    badgeBg: '#dc2626',
    badgeText: '#ffffff',
    accent: '#f87171',
    hasScript: true,
    hasSheen: true,
  },
  SCRIPT_10: {
    label: 'GOLD INK SCRIPT',
    border: '#f59e0b',
    topBg: '#271a06',
    bottomBg: '#0b0a09',
    badgeBg: '#d97706',
    badgeText: '#09090b',
    accent: '#fbbf24',
    hasScript: true,
    hasSheen: true,
  },
  GOLD_25: {
    label: 'GOLD FOIL',
    border: '#eab308',
    topBg: '#241d07',
    bottomBg: '#0a0a0b',
    badgeBg: '#eab308',
    badgeText: '#09090b',
    accent: '#fde047',
    hasScript: false,
    hasSheen: true,
  },
  CRIMSON_99: {
    label: 'CRIMSON CHROME',
    border: '#dc2626',
    topBg: '#260a0d',
    bottomBg: '#0a0a0b',
    badgeBg: '#dc2626',
    badgeText: '#ffffff',
    accent: '#f87171',
    hasScript: false,
    hasSheen: true,
  },
  HOLO: {
    label: 'HOLO FOIL',
    border: '#a78bfa',
    topBg: '#1b132b',
    bottomBg: '#0a0a0d',
    badgeBg: '#7c3aed',
    badgeText: '#ffffff',
    accent: '#c4b5fd',
    hasScript: false,
    hasSheen: true,
  },
  BASE: {
    label: 'BASE SERIES',
    border: '#3f3f46',
    topBg: '#18181b',
    bottomBg: '#0a0a0b',
    badgeBg: '#27272a',
    badgeText: '#e4e4e7',
    accent: '#a1a1aa',
    hasScript: false,
    hasSheen: false,
  },
};

export async function exportPulledCardPng(card, teamInfo) {
  if (!card) return;
  const W = 750;
  const H = 1050;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const style = RARITY_CANVAS_STYLES[card.rarityId] || RARITY_CANVAS_STYLES.BASE;
  const teamColor = teamInfo?.color || '#27272a';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, style.topBg);
  bg.addColorStop(0.55, '#101013');
  bg.addColorStop(1, style.bottomBg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rad = ctx.createRadialGradient(W / 2, 370, 40, W / 2, 370, 340);
  rad.addColorStop(0, `${teamColor}66`);
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  if (style.hasSheen) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    const sheen = ctx.createLinearGradient(0, 0, W, H);
    if (card.rarityId === 'HOLO') {
      sheen.addColorStop(0, '#38bdf8');
      sheen.addColorStop(0.35, '#a78bfa');
      sheen.addColorStop(0.7, '#f472b6');
      sheen.addColorStop(1, '#34d399');
    } else {
      sheen.addColorStop(0, '#ffffff');
      sheen.addColorStop(0.5, style.border);
      sheen.addColorStop(1, '#ffffff');
    }
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.lineTo(W, 380);
    ctx.lineTo(W, 560);
    ctx.lineTo(0, 300);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, 22, 22, W - 44, H - 44, 28);
  ctx.strokeStyle = style.border;
  ctx.lineWidth = card.rarityId === 'OBSIDIAN_1' ? 6 : 4;
  ctx.stroke();

  roundRectPath(ctx, 36, 36, W - 72, H - 72, 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.accent;
  ctx.font = '800 15px "JetBrains Mono", monospace';
  ctx.fillText(String(card.series || '2026-27 HOT STOVE').toUpperCase(), 60, 78);

  const serialLabel = card.serialCap
    ? `#${String(card.serialNumber || 1).padStart(card.serialCap >= 100 ? 3 : 2, '0')} / ${card.serialCap}`
    : style.label;

  ctx.font = '800 16px "JetBrains Mono", monospace';
  const badgeW = Math.max(150, ctx.measureText(serialLabel).width + 32);
  roundRectPath(ctx, W - 60 - badgeW, 58, badgeW, 38, 8);
  ctx.fillStyle = style.badgeBg;
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = style.badgeText;
  ctx.fillText(serialLabel, W - 60 - badgeW / 2, 78);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.font = '900 220px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(teamInfo?.abbr || card.teamAbbr || 'MLB', W / 2, 360);
  ctx.restore();

  const headshotUrl = card.playerId
    ? `https://midfield.mlbstatic.com/v1/people/${card.playerId}/spots/213`
    : null;
  const img = await loadCorsImage(headshotUrl);
  const initials = (card.fullName || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  drawAvatarMedallion(ctx, img, (W - 310) / 2, 175, 310, teamColor, initials, null);

  if (style.hasScript) {
    ctx.save();
    ctx.translate(W / 2, 515);
    ctx.rotate(-0.07);
    ctx.textAlign = 'center';
    ctx.fillStyle = card.rarityId === 'OBSIDIAN_1' ? '#f87171' : '#fbbf24';
    ctx.font = 'italic 700 44px Georgia, "Times New Roman", serif';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;
    ctx.fillText(card.fullName || '', 0, 0);
    ctx.restore();
  }

  const plateY = 580;
  roundRectPath(ctx, 56, plateY, W - 112, 330, 18);
  ctx.fillStyle = 'rgba(17, 17, 19, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  roundRectPath(ctx, 56, plateY, W - 112, 8, 4);
  ctx.fillStyle = teamColor;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = style.accent;
  ctx.font = '800 14px "JetBrains Mono", monospace';
  ctx.fillText(
    `${teamInfo?.name || card.teamAbbr || 'MLB'}  •  ${card.position || 'MLB'}  •  ${style.label}`.toUpperCase(),
    W / 2,
    plateY + 46
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(fitText(ctx, card.fullName, W - 150), W / 2, plateY + 104);

  roundRectPath(ctx, 84, plateY + 142, W - 168, 76, 12);
  ctx.fillStyle = '#0a0a0b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.stroke();

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText(fitText(ctx, card.statLine || 'Official MLB Pull', W - 200), W / 2, plateY + 182);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  const stampText = card.gameMatchup
    ? `GAME CHECK-IN • ${card.gameMatchup} • ${card.sourceTag || ''}`
    : `${card.packMode === 'GAME_CHECKIN' ? 'GAME CHECK-IN' : 'HOT STOVE WIRE'} • ${card.sourceTag || ''}`;
  ctx.fillText(fitText(ctx, stampText.toUpperCase(), W - 160), W / 2, plateY + 266);

  ctx.fillStyle = '#71717a';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText('HOT STOVE TRACKER  •  hot-stove-tracker.vercel.app', W / 2, H - 62);

  downloadCanvas(canvas, `${slugify(card.fullName)}-${slugify(card.rarityId)}.png`);
}

export async function exportShowcasePng(handle, pinnedCards, getTeamInfoFn) {
  const W = 1200;
  const H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(44, 34, 5, 34);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(`@${handle || 'collector'} — Pinned Showcase`, 62, 60);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillText(`2026-27 HOT STOVE SERIES  •  ${pinnedCards.length} / 6 PINNED PULLS`, 62, 82);

  const slots = pinnedCards.slice(0, 6);
  const imgs = await Promise.all(
    slots.map((c) =>
      loadCorsImage(c.playerId ? `https://midfield.mlbstatic.com/v1/people/${c.playerId}/spots/120` : null)
    )
  );

  const cols = 3;
  const gapX = 18;
  const gapY = 18;
  const cardW = (W - 88 - gapX * 2) / cols;
  const cardH = 236;
  const startY = 108;

  for (let i = 0; i < 6; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 44 + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const card = slots[i];

    if (!card) {
      roundRectPath(ctx, x, y, cardW, cardH, 14);
      ctx.fillStyle = '#111113';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#52525b';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillText(`EMPTY SLOT #${i + 1}`, x + cardW / 2, y + cardH / 2);
      continue;
    }

    const st = RARITY_CANVAS_STYLES[card.rarityId] || RARITY_CANVAS_STYLES.BASE;
    const team = getTeamInfoFn ? getTeamInfoFn(card.teamAbbr) : { color: '#27272a', abbr: card.teamAbbr };

    const cGrad = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
    cGrad.addColorStop(0, st.topBg);
    cGrad.addColorStop(1, '#111113');
    roundRectPath(ctx, x, y, cardW, cardH, 14);
    ctx.fillStyle = cGrad;
    ctx.fill();
    ctx.strokeStyle = st.border;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const init = (card.fullName || 'ML').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    drawAvatarMedallion(ctx, imgs[i], x + 18, y + 20, 74, team.color, init, null);

    const badge = card.serialCap
      ? `#${String(card.serialNumber || 1).padStart(2, '0')}/${card.serialCap}`
      : st.label.split(' ')[0];
    ctx.font = '800 11px "JetBrains Mono", monospace';
    const bw = Math.max(66, ctx.measureText(badge).width + 18);
    roundRectPath(ctx, x + cardW - 16 - bw, y + 18, bw, 24, 6);
    ctx.fillStyle = st.badgeBg;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = st.badgeText;
    ctx.fillText(badge, x + cardW - 16 - bw / 2, y + 30);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = st.accent;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(`${card.teamAbbr || 'MLB'} • ${card.position || 'MLB'}`, x + 106, y + 66);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px "Plus Jakarta Sans", Inter, sans-serif';
    ctx.fillText(fitText(ctx, card.fullName, cardW - 122), x + 106, y + 92);

    roundRectPath(ctx, x + 18, y + 118, cardW - 36, 56, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText(fitText(ctx, card.statLine || 'Official Pull', cardW - 60), x + 30, y + 150);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(fitText(ctx, card.sourceTag || card.series, cardW - 36), x + 18, y + 206);
  }

  drawFooter(ctx, W, H, `@${handle || 'collector'} • Collector Showcase`);
  downloadCanvas(canvas, `${slugify(handle || 'collector')}-showcase.png`);
}
