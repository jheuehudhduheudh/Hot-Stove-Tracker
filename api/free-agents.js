const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

const ALL_MLB_TEAM_IDS = Object.keys(MLB_TEAM_ID_TO_ABBR).join(',');

function formatStatLine(person) {
  const stats = person?.stats || [];
  for (const s of stats) {
    const split = s?.splits?.[0]?.stat;
    if (!split) continue;
    const group = s?.group?.displayName?.toLowerCase() || '';
    if (group === 'pitching' && (split.inningsPitched || split.era)) {
      return `${split.era || '—'} ERA • ${split.whip || '—'} WHIP • ${split.strikeOuts ?? 0} K (${split.inningsPitched || '0'} IP)`;
    }
    if (group === 'hitting' && (split.atBats > 0 || split.avg)) {
      return `${split.avg || '—'} AVG • ${split.homeRuns ?? 0} HR • ${split.ops || '—'} OPS`;
    }
  }
  return '';
}

function getPerformanceScore(person) {
  const stats = person?.stats || [];
  let score = 0;
  for (const s of stats) {
    const split = s?.splits?.[0]?.stat;
    if (!split) continue;
    const group = s?.group?.displayName?.toLowerCase() || '';
    if (group === 'hitting') {
      score += (Number(split.gamesPlayed || 0) * 1.5) + (Number(split.homeRuns || 0) * 4) + (Number(split.hits || 0) * 0.6);
    }
    if (group === 'pitching') {
      score += (Number(split.gamesPlayed || 0) * 1.2) + (Number(split.strikeOuts || 0) * 0.8) + (parseFloat(split.inningsPitched || 0) * 1.1);
    }
  }
  return score;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');

  const currentYear = new Date().getFullYear();
  const statSeason = new Date().getMonth() >= 9 ? currentYear : currentYear - 1;
  let candidates = [];

  for (const season of [currentYear, currentYear + 1, currentYear - 1]) {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/people/freeAgents?season=${season}`);
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data?.freeAgents) && data.freeAgents.length > 0) {
        const unsigned = data.freeAgents.filter((fa) => !fa.newTeam && fa.player?.id);
        if (unsigned.length > 0) {
          candidates = unsigned.map((fa) => ({
            playerId: fa.player.id,
            fullName: fa.player.fullName || 'Unknown Player',
            position: fa.position?.abbreviation || 'MLB',
            lastTeam: MLB_TEAM_ID_TO_ABBR[fa.originalTeam?.id] || 'MLB',
            faDate: fa.dateSigned || `${season} Class`,
          }));
          break;
        }
      }
    } catch {
      // Fall through to official transaction scan
    }
  }

  if (candidates.length === 0) {
    try {
      const end = new Date();
      const start = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
      const fmt = (d) => d.toISOString().slice(0, 10);

      const txRes = await fetch(
        `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${fmt(start)}&endDate=${fmt(end)}`
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
                faDate: tx.date || '',
                txTime,
              });
            }
          }

          if (['SFA', 'SGN'].includes(tx.typeCode) && MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id]) {
            const prevSign = signedMap.get(pid) || 0;
            if (txTime >= prevSign) signedMap.set(pid, txTime);
          }
        }

        for (const [pid, entry] of faMap.entries()) {
          const signedTime = signedMap.get(pid) || 0;
          if (signedTime <= entry.txTime) {
            candidates.push(entry);
          }
        }
      }
    } catch (err) {
      return res.status(500).json({ error: `Failed to fetch MLB free agents: ${err.message}` });
    }
  }

  if (candidates.length === 0) {
    return res.status(200).json({ freeAgents: [], season: statSeason });
  }

  const limited = candidates.slice(0, 150);
  const enriched = [];

  for (let i = 0; i < limited.length; i += 50) {
    const chunk = limited.slice(i, i + 50);
    const ids = chunk.map((c) => c.playerId).join(',');
    try {
      const pRes = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=stats(group=[hitting,pitching],type=[season],season=${statSeason})`
      );
      if (pRes.ok) {
        const pData = await pRes.json();
        const peopleById = new Map((pData?.people || []).map((p) => [p.id, p]));

        for (const c of chunk) {
          const p = peopleById.get(c.playerId);
          const statLine = formatStatLine(p);
          const score = getPerformanceScore(p);
          const pos = p?.primaryPosition?.abbreviation || c.position || 'MLB';
          enriched.push({
            playerId: c.playerId,
            fullName: p?.fullName || c.fullName,
            position: pos,
            age: p?.currentAge || '—',
            lastTeam: c.lastTeam,
            statLine: statLine || `MLB Free Agent (${c.faDate || statSeason})`,
            hasMlbStats: Boolean(statLine),
            score,
            tier: score >= 140 ? 'Top Tier' : score >= 55 ? 'MLB Regular' : 'Available',
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
          tier: 'Available',
        });
      }
    }
  }

  enriched.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));

  return res.status(200).json({
    season: statSeason,
    count: enriched.length,
    freeAgents: enriched.slice(0, 80),
  });
}
