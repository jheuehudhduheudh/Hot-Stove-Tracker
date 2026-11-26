const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

const ALL_MLB_TEAM_IDS = Object.keys(MLB_TEAM_ID_TO_ABBR).join(',');

function isPrimaryPitcher(person) {
  const abbr = person?.primaryPosition?.abbreviation || '';
  const type = person?.primaryPosition?.type || '';
  return type === 'Pitcher' || ['P', 'SP', 'RP', 'RHP', 'LHP'].includes(abbr);
}

function getPreferredStatSplit(person) {
  const stats = person?.stats || [];
  const wantsPitching = isPrimaryPitcher(person);
  const preferredGroup = wantsPitching ? 'pitching' : 'hitting';

  const preferred = stats.find(
    (s) => (s?.group?.displayName || '').toLowerCase() === preferredGroup && s?.splits?.[0]?.stat
  );
  if (preferred) {
    return { group: preferredGroup, stat: preferred.splits[0].stat };
  }

  const fallback = stats.find((s) => s?.splits?.[0]?.stat);
  if (fallback) {
    return {
      group: (fallback?.group?.displayName || '').toLowerCase(),
      stat: fallback.splits[0].stat,
    };
  }
  return null;
}

function formatStatLine(person) {
  const picked = getPreferredStatSplit(person);
  if (!picked) return '';
  const { group, stat: split } = picked;

  if (group === 'pitching' && (split.inningsPitched || split.era)) {
    const svText = Number(split.saves || 0) >= 5 ? ` • ${split.saves} SV` : '';
    return `${split.era || '—'} ERA • ${split.whip || '—'} WHIP • ${split.strikeOuts ?? 0} K (${split.inningsPitched || '0'} IP)${svText}`;
  }
  if (group === 'hitting' && (split.atBats > 0 || split.avg)) {
    return `${split.avg || '—'} AVG • ${split.homeRuns ?? 0} HR • ${split.ops || '—'} OPS`;
  }
  return '';
}

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function safeFloat(val, fallback = 0) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchWithTimeout(url, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'HotStoveTracker/2.6' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function getPerformanceScore(person, isCareer = false) {
  const picked = getPreferredStatSplit(person);
  if (!picked) return 0;
  const { group, stat: split } = picked;

  if (group === 'hitting') {
    const ab = safeNum(split.atBats, 0);
    const bb = safeNum(split.baseOnBalls, 0);
    const pa = safeNum(split.plateAppearances, ab + bb);
    const hr = safeNum(split.homeRuns, 0);
    const sb = safeNum(split.stolenBases, 0);
    const ops = safeFloat(split.ops, 0.65);

    if (pa === 0 && ab === 0) return 0;

    if (isCareer) {
      const games = safeNum(split.gamesPlayed, 0);
      const opsAbove = Math.max(-0.08, ops - 0.69);
      const raw = (Math.min(games, 1600) * 0.14) + (opsAbove * 750 * Math.min(1, pa / 1500)) + (hr * 0.55) + (sb * 0.25);
      return Number.isFinite(raw) ? raw : 0;
    }

    const opsAbove = Math.max(-0.12, ops - 0.68);
    const paFactor = Math.min(pa, 680) / 550;
    const qualMult = Math.min(1.15, pa / 420);
    const raw = Math.max(1, (paFactor * 80) + (opsAbove * 1050 * qualMult) + (hr * 2.0) + (sb * 1.0));
    return Number.isFinite(raw) ? raw : 0;
  }

  if (group === 'pitching') {
    const ip = safeFloat(split.inningsPitched, 0);
    const ks = safeNum(split.strikeOuts, 0);
    const era = safeFloat(split.era, 6.0);
    const whip = safeFloat(split.whip, 1.6);
    const saves = safeNum(split.saves, 0);
    const holds = safeNum(split.holds, 0);

    if (ip <= 0) return 0;

    if (isCareer) {
      const eraScore = Math.max(-10, (4.45 - era) * 38) * Math.min(1, ip / 400);
      const raw = (Math.min(ip, 2000) * 0.14) + (Math.min(ks, 2200) * 0.08) + eraScore + (saves * 0.75) + (holds * 0.25);
      return Number.isFinite(raw) ? raw : 0;
    }

    const runsSaved = Math.max(-12, (4.65 - era) * (ip / 9));
    const whipBonus = ip >= 30 ? Math.max(-15, (1.35 - whip) * 65 * Math.min(1, ip / 90)) : 0;
    const raw = Math.max(1, (ip * 0.80) + (ks * 0.52) + (runsSaved * 4.5) + whipBonus + (saves * 2.1) + (holds * 0.9));
    return Number.isFinite(raw) ? raw : 0;
  }

  return 0;
}

function assignTier(score, isCareer) {
  if (isCareer) {
    if (score >= 340) return 'Elite';
    if (score >= 220) return 'Top Tier';
    if (score >= 115) return 'MLB Regular';
    return 'Depth';
  }
  if (score >= 310) return 'Elite';
  if (score >= 215) return 'Top Tier';
  if (score >= 120) return 'MLB Regular';
  return 'Depth';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');

  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultClassYear = now.getMonth() >= 9 ? currentYear : currentYear - 1;

  const rawClass = String(req.query?.classYear || req.query?.season || defaultClassYear);
  const classYear = /^\d{4}$/.test(rawClass) ? Number(rawClass) : defaultClassYear;
  const isCareer = String(req.query?.statMode || '').toLowerCase() === 'career';

  const startDate = `${classYear}-10-20`;
  const endBound = new Date(`${classYear + 1}-04-05T00:00:00Z`);
  const endDateObj = endBound > now ? now : endBound;
  const endDate = endDateObj.toISOString().slice(0, 10);

  const faMap = new Map();
  const signedMap = new Map();

  // Fetch Official MLB Offseason Transactions + MLB Free Agents list (for classYear + 1) in parallel
  const [txRes, faApiRes] = await Promise.all([
    fetchWithTimeout(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${startDate}&endDate=${endDate}`,
      5000
    ).catch(() => null),
    fetchWithTimeout(
      `https://statsapi.mlb.com/api/v1/people/freeAgents?season=${classYear + 1}`,
      4500
    ).catch(() => null),
  ]);

  // 1. Parse Official MLB Transactions for this exact offseason (Oct 20 -> Apr 5)
  if (txRes && txRes.ok) {
    try {
      const txData = await txRes.json();
      const rawTx = txData?.transactions || [];

      for (const tx of rawTx) {
        const pid = tx.person?.id;
        if (!pid) continue;

        const desc = (tx.description || '').toLowerCase();
        const txTime = tx.date ? new Date(tx.date).getTime() : 0;
        const fromAbbr = MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] || null;
        const toAbbr = MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] || null;

        // Track MLB free-agency entries (skip minor-league affiliate releases/elections)
        const isFreeAgencyEvent =
          desc.includes('elected free agency') ||
          desc.includes('declared free agency') ||
          desc.includes('non-tendered') ||
          desc.includes('declined option') ||
          desc.includes('opted out') ||
          (tx.typeCode === 'REL' && Boolean(fromAbbr));

        if (isFreeAgencyEvent && (fromAbbr || toAbbr) && !desc.includes('minor league')) {
          const teamAbbr = fromAbbr || toAbbr || 'MLB';
          const prev = faMap.get(pid);
          if (!prev || txTime >= prev.txTime) {
            faMap.set(pid, {
              playerId: pid,
              fullName: tx.person?.fullName || 'Unknown Player',
              position: 'MLB',
              lastTeam: teamAbbr,
              faDate: tx.date || `${classYear} Class`,
              txTime,
            });
          }
        }

        // Track subsequent MLB signings (and capture minor league deals only if no MLB deal)
        if (['SFA', 'SGN'].includes(tx.typeCode) && toAbbr) {
          const prevSign = signedMap.get(pid);
          if (!prevSign || txTime >= prevSign.txTime) {
            signedMap.set(pid, {
              team: toAbbr,
              date: tx.date || '',
              txTime,
            });
          }
        }
      }
    } catch (err) {
      console.error('Transactions parse warning:', err.message);
    }
  }

  // 2. Merge MLB /people/freeAgents?season={classYear + 1} if populated (adds posted players & confirms signings)
  if (faApiRes && faApiRes.ok) {
    try {
      const faJson = await faApiRes.json();
      if (Array.isArray(faJson?.freeAgents)) {
        for (const fa of faJson.freeAgents) {
          const pid = fa.player?.id;
          if (!pid) continue;
          const origAbbr = MLB_TEAM_ID_TO_ABBR[fa.originalTeam?.id] || 'MLB';
          const newAbbr = fa.newTeam?.id
            ? MLB_TEAM_ID_TO_ABBR[fa.newTeam.id] || fa.newTeam.abbreviation || null
            : null;

          if (!faMap.has(pid)) {
            faMap.set(pid, {
              playerId: pid,
              fullName: fa.player.fullName || 'Unknown Player',
              position: fa.position?.abbreviation || 'MLB',
              lastTeam: origAbbr,
              faDate: `${classYear} Class`,
              txTime: 0,
            });
          }
          if (newAbbr && !signedMap.has(pid)) {
            signedMap.set(pid, {
              team: newAbbr,
              date: fa.dateSigned || '',
              txTime: Number.MAX_SAFE_INTEGER,
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  const candidates = [];
  for (const [pid, entry] of faMap.entries()) {
    const signInfo = signedMap.get(pid);
    const signedAfterFa = Boolean(signInfo && signInfo.txTime >= entry.txTime);
    candidates.push({
      playerId: entry.playerId,
      fullName: entry.fullName,
      position: entry.position,
      lastTeam: entry.lastTeam,
      signedTeam: signedAfterFa ? signInfo.team : null,
      isSigned: signedAfterFa,
      signedDate: signedAfterFa ? signInfo.date : '',
      faDate: entry.faDate,
    });
  }

  if (candidates.length === 0) {
    return res.status(200).json({ classYear, statMode: isCareer ? 'career' : 'season', freeAgents: [] });
  }

  // 3. Hydrate ALL candidates (up to 900) in parallel chunks of 100 so ZERO stars get dropped
  const limited = candidates.slice(0, 900);
  const hydrateParam = isCareer
    ? 'stats(group=[hitting,pitching],type=[career])'
    : `stats(group=[hitting,pitching],type=[season],season=${classYear})`;

  const chunks = [];
  for (let i = 0; i < limited.length; i += 100) {
    chunks.push(limited.slice(i, i + 100));
  }

  const peopleById = new Map();
  await Promise.all(
    chunks.map(async (chunk) => {
      const ids = chunk.map((c) => c.playerId).join(',');
      try {
        const pRes = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=${hydrateParam}`,
          4000
        );
        if (pRes.ok) {
          const pData = await pRes.json();
          for (const p of pData?.people || []) {
            peopleById.set(p.id, p);
          }
        }
      } catch {
        // Skip failed chunk gracefully
      }
    })
  );

  const enriched = [];
  for (const c of limited) {
    const p = peopleById.get(c.playerId);
    const statLine = formatStatLine(p);
    const score = getPerformanceScore(p, isCareer);
    const pos = p?.primaryPosition?.abbreviation || c.position || 'MLB';

    // Skip pure minor-leaguers with zero MLB stats in this view so the board stays pure MLB
    if (!statLine && !p?.mlbDebutDate) continue;

    enriched.push({
      playerId: c.playerId,
      fullName: p?.fullName || c.fullName,
      position: pos,
      age: p?.currentAge || '—',
      lastTeam: c.lastTeam,
      signedTeam: c.signedTeam || null,
      isSigned: Boolean(c.isSigned),
      signedDate: c.signedDate || '',
      statLine: statLine || `No MLB stats in ${isCareer ? 'career' : classYear}`,
      hasMlbStats: Boolean(statLine),
      score: Number((Number.isFinite(score) ? score : 0).toFixed(1)),
      tier: assignTier(score, isCareer),
    });
  }

  enriched.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));

  return res.status(200).json({
    classYear,
    statMode: isCareer ? 'career' : 'season',
    totalScanned: candidates.length,
    count: enriched.length,
    freeAgents: enriched.slice(0, 120),
  });
}
