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

function getPerformanceScore(person, isCareer = false) {
  const picked = getPreferredStatSplit(person);
  if (!picked) return 0;
  const { group, stat: split } = picked;

  if (group === 'hitting') {
    const games = Number(split.gamesPlayed || 0);
    const hr = Number(split.homeRuns || 0);
    const hits = Number(split.hits || 0);
    const ops = parseFloat(split.ops || 0);
    if (isCareer) {
      return (games * 0.25) + (hr * 1.1) + (ops >= 0.75 ? ops * 90 : ops * 40);
    }
    return (games * 1.1) + (hr * 4.5) + (hits * 0.5) + (ops > 0 ? ops * 85 : 0);
  }

  if (group === 'pitching') {
    const ip = parseFloat(split.inningsPitched || 0);
    const ks = Number(split.strikeOuts || 0);
    const era = parseFloat(split.era || 5.5);
    const games = Number(split.gamesPlayed || 0);
    const saves = Number(split.saves || 0);
    const holds = Number(split.holds || 0);
    const eraBonus = ip >= 25 ? Math.max(0, (4.8 - era) * 38) : 0;

    if (isCareer) {
      return (ip * 0.2) + (ks * 0.15) + (saves * 1.2) + (holds * 0.5) + eraBonus;
    }
    const reliefBonus = (saves * 4.5) + (holds * 2.5) + (games >= 40 && ip < 100 ? games * 1.1 : 0);
    return (ip * 1.0) + (ks * 0.75) + eraBonus + reliefBonus;
  }

  return 0;
}

function assignTier(score, isCareer) {
  if (isCareer) {
    if (score >= 420) return 'Elite';
    if (score >= 250) return 'Top Tier';
    if (score >= 110) return 'MLB Regular';
    return 'Depth';
  }
  if (score >= 325) return 'Elite';
  if (score >= 225) return 'Top Tier';
  if (score >= 115) return 'MLB Regular';
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

  let candidates = [];

  // Attempt 1: Official MLB Stats API /people/freeAgents for that exact class year
  const seasonsToTry = classYear === defaultClassYear ? [classYear, classYear + 1] : [classYear];
  for (const s of seasonsToTry) {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/people/freeAgents?season=${s}`);
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data?.freeAgents) && data.freeAgents.length > 0) {
        const seen = new Map();
        for (const fa of data.freeAgents) {
          const pid = fa.player?.id;
          if (!pid) continue;
          const signedTeam = fa.newTeam?.id
            ? MLB_TEAM_ID_TO_ABBR[fa.newTeam.id] || fa.newTeam.abbreviation || fa.newTeam.name
            : null;
          seen.set(pid, {
            playerId: pid,
            fullName: fa.player.fullName || 'Unknown Player',
            position: fa.position?.abbreviation || 'MLB',
            lastTeam: MLB_TEAM_ID_TO_ABBR[fa.originalTeam?.id] || 'MLB',
            signedTeam,
            isSigned: Boolean(signedTeam),
            signedDate: fa.dateSigned || '',
            faDate: `${classYear} Class`,
          });
        }
        if (seen.size > 0) {
          candidates = Array.from(seen.values());
          break;
        }
      }
    } catch {
      // Fall through to official MLB transaction scan for that offseason
    }
  }

  // Attempt 2: Scan Official MLB Stats API Transactions for that specific offseason (Oct 25 -> Apr 1)
  if (candidates.length === 0) {
    try {
      const startDate = `${classYear}-10-25`;
      const endBound = new Date(`${classYear + 1}-04-01T00:00:00Z`);
      const endDateObj = endBound > now ? now : endBound;
      const endDate = endDateObj.toISOString().slice(0, 10);

      const txRes = await fetch(
        `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${startDate}&endDate=${endDate}`
      );
      if (txRes.ok) {
        const txData = await txRes.json();
        const rawTx = txData?.transactions || [];

        const faMap = new Map();
        const signedMap = new Map();

        for (const tx of rawTx) {
          const pid = tx.person?.id;
          if (!pid) continue;
          const desc = (tx.description || '').toLowerCase();
          const txTime = tx.date ? new Date(tx.date).getTime() : 0;

          if (
            desc.includes('elected free agency') ||
            desc.includes('declared free agency') ||
            desc.includes('non-tendered') ||
            (tx.typeCode === 'REL' && MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id])
          ) {
            const teamAbbr =
              MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] ||
              MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] ||
              'MLB';
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

          if (['SFA', 'SGN'].includes(tx.typeCode) && MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id]) {
            const isMinorDeal = desc.includes('minor league');
            const prevSign = signedMap.get(pid);
            if (!prevSign || txTime >= prevSign.txTime) {
              signedMap.set(pid, {
                team: MLB_TEAM_ID_TO_ABBR[tx.toTeam.id],
                date: tx.date || '',
                txTime,
                isMinorDeal,
              });
            }
          }
        }

        for (const [pid, entry] of faMap.entries()) {
          const signInfo = signedMap.get(pid);
          const signedAfterFa = signInfo && signInfo.txTime >= entry.txTime;
          candidates.push({
            playerId: entry.playerId,
            fullName: entry.fullName,
            position: entry.position,
            lastTeam: entry.lastTeam,
            signedTeam: signedAfterFa ? signInfo.team : null,
            isSigned: Boolean(signedAfterFa),
            signedDate: signedAfterFa ? signInfo.date : '',
            faDate: entry.faDate,
          });
        }
      }
    } catch (err) {
      return res.status(500).json({ error: `Failed to fetch ${classYear} free agent class: ${err.message}` });
    }
  }

  if (candidates.length === 0) {
    return res.status(200).json({ classYear, statMode: isCareer ? 'career' : 'season', freeAgents: [] });
  }

  // Hydrate up to 180 candidates with stats from classYear (or career)
  const limited = candidates.slice(0, 180);
  const enriched = [];

  const hydrateParam = isCareer
    ? 'stats(group=[hitting,pitching],type=[career])'
    : `stats(group=[hitting,pitching],type=[season],season=${classYear})`;

  for (let i = 0; i < limited.length; i += 50) {
    const chunk = limited.slice(i, i + 50);
    const ids = chunk.map((c) => c.playerId).join(',');
    try {
      const pRes = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=${hydrateParam}`
      );
      if (pRes.ok) {
        const pData = await pRes.json();
        const peopleById = new Map((pData?.people || []).map((p) => [p.id, p]));

        for (const c of chunk) {
          const p = peopleById.get(c.playerId);
          const statLine = formatStatLine(p);
          const score = getPerformanceScore(p, isCareer);
          const pos = p?.primaryPosition?.abbreviation || c.position || 'MLB';
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
            score: Number(score.toFixed(1)),
            tier: assignTier(score, isCareer),
          });
        }
      }
    } catch {
      for (const c of chunk) {
        enriched.push({
          ...c,
          age: '—',
          statLine: 'MLB Free Agent',
          hasMlbStats: false,
          score: 0,
          tier: 'Depth',
        });
      }
    }
  }

  enriched.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));

  return res.status(200).json({
    classYear,
    statMode: isCareer ? 'career' : 'season',
    count: enriched.length,
    freeAgents: enriched.slice(0, 100),
  });
}
