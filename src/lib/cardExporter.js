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

  // Club & Position pill (omit club when discontinued or unavailable)
  const clubParts = [
    playerStats.currentTeamAbbr && teamInfo?.name ? teamInfo.name : null,
    playerStats.position || 'MLB',
    playerStats.primaryNumber ? `#${playerStats.primaryNumber}` : null,
  ].filter(Boolean);
  const clubLabel = clubParts.join('  •  ');
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText(clubLabel.toUpperCase(), textX, 74);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(fitText(ctx, playerStats.fullName, 740), textX, 124);

  const batsCode = playerStats.bats || playerStats.batSide;
  const throwsCode = playerStats.throws || playerStats.pitchHand;
  const hasBT = batsCode && throwsCode && batsCode !== '—' && throwsCode !== '—';
  const bioParts = [
    playerStats.age && playerStats.age !== '—' ? `Age ${playerStats.age}` : null,
    hasBT ? `B/T: ${batsCode}/${throwsCode}` : null,
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
