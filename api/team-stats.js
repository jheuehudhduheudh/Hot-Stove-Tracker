const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

const TEAM_DEFAULT_LEAGUE = {
  LAA: 'AL', BAL: 'AL', BOS: 'AL', CLE: 'AL', DET: 'AL',
  HOU: 'AL', KC: 'AL', ATH: 'AL', SEA: 'AL', TB: 'AL',
  TEX: 'AL', TOR: 'AL', MIN: 'AL', CWS: 'AL', NYY: 'AL',
  ARI: 'NL', CHC: 'NL', CIN: 'NL', COL: 'NL', LAD: 'NL',
  WSH: 'NL', NYM: 'NL', PIT: 'NL', SD: 'NL', SF: 'NL',
  STL: 'NL', PHI: 'NL', ATL: 'NL', MIA: 'NL', MIL: 'NL',
};

const DIVISION_ID_TO_NAME = {
  200: 'AL West',
  201: 'AL East',
  202: 'AL Central',
  203: 'NL West',
  204: 'NL East',
  205: 'NL Central',
};

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseInnings(ipStr) {
  if (!ipStr && ipStr !== 0) return 0;
  const s = String(ipStr);
  const [whole, frac] = s.split('.');
  const w = parseInt(whole, 10) || 0;
  const f = parseInt(frac, 10) || 0;
  return w + (f === 1 ? 1 / 3 : f === 2 ? 2 / 3 : 0);
}

function assignRanks(rows, getValue, ascending = false) {
  const valid = rows
    .map((r) => ({ id: r.teamId, val: getValue(r) }))
    .filter((x) => Number.isFinite(x.val));
  valid.sort((a, b) => (ascending ? a.val - b.val : b.val - a.val));
  const rankMap = new Map();
  let lastVal = null;
  let lastRank = 0;
  valid.forEach((item, idx) => {
    if (lastVal !== null && item.val === lastVal) {
      rankMap.set(item.id, lastRank);
    } else {
      lastRank = idx + 1;
      lastVal = item.val;
      rankMap.set(item.id, lastRank);
    }
  });
  return rankMap;
}

async function fetchJsonSafe(url, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'HotStoveTracker/2.5' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSeasonBundle(season) {
  const base = 'https://statsapi.mlb.com/api/v1';
  const [hitJson, pitchJson, fieldJson, standJson] = await Promise.all([
    fetchJsonSafe(`${base}/teams/stats?season=${season}&sportIds=1&group=hitting&stats=season&gameType=R`),
    fetchJsonSafe(`${base}/teams/stats?season=${season}&sportIds=1&group=pitching&stats=season&gameType=R`),
    fetchJsonSafe(`${base}/teams/stats?season=${season}&sportIds=1&group=fielding&stats=season&gameType=R`),
    fetchJsonSafe(`${base}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`),
  ]);

  const hitSplits = hitJson?.stats?.[0]?.splits || [];
  const pitchSplits = pitchJson?.stats?.[0]?.splits || [];
  const fieldSplits = fieldJson?.stats?.[0]?.splits || [];
  const standRecords = standJson?.records || [];

  return { hitSplits, pitchSplits, fieldSplits, standRecords };
}

export default async function handler(req, res) {
  const now = new Date();
  const defaultSeason = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  const requestedRaw = parseInt(req.query?.season, 10);
  const requestedSeason =
    Number.isInteger(requestedRaw) && requestedRaw >= 2000 && requestedRaw <= now.getFullYear() + 1
      ? requestedRaw
      : defaultSeason;

  try {
    let effectiveSeason = requestedSeason;
    let autoFallback = false;
    let bundle = await fetchSeasonBundle(effectiveSeason);

    // If the requested season hasn't started regular-season play yet (e.g., Jan–Mar), fall back automatically
    if (bundle.hitSplits.length === 0 && bundle.pitchSplits.length === 0 && effectiveSeason > 2000) {
      effectiveSeason = effectiveSeason - 1;
      autoFallback = true;
      bundle = await fetchSeasonBundle(effectiveSeason);
    }

    const { hitSplits, pitchSplits, fieldSplits, standRecords } = bundle;
    const teamMap = new Map();

    const ensureTeam = (teamId, teamName) => {
      const id = Number(teamId);
      if (!MLB_TEAM_ID_TO_ABBR[id]) return null;
      const abbr = MLB_TEAM_ID_TO_ABBR[id];
      if (!teamMap.has(id)) {
        teamMap.set(id, {
          teamId: id,
          abbr,
          name: teamName || abbr,
          league: TEAM_DEFAULT_LEAGUE[abbr] || 'MLB',
          division: '',
          record: {
            wins: 0,
            losses: 0,
            winPct: 0,
            gamesPlayed: 0,
            runsScored: 0,
            runsAllowed: 0,
            runDiff: 0,
            pythWinPct: 0,
            streak: '—',
            divRank: null,
            gb: '—',
            homeRecord: '—',
            awayRecord: '—',
            lastTen: '—',
          },
          hitting: {
            gamesPlayed: 0,
            runs: 0,
            runsPerGame: 0,
            hits: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            rbi: 0,
            stolenBases: 0,
            baseOnBalls: 0,
            strikeOuts: 0,
            avg: 0,
            obp: 0,
            slg: 0,
            ops: 0,
          },
          pitching: {
            era: 0,
            whip: 0,
            wins: 0,
            losses: 0,
            saves: 0,
            blownSaves: 0,
            inningsPitched: '0.0',
            strikeOuts: 0,
            baseOnBalls: 0,
            homeRuns: 0,
            avgAgainst: 0,
            kPer9: 0,
            bbPer9: 0,
            kToBb: 0,
            shutouts: 0,
            runsAllowed: 0,
            runsAllowedPerGame: 0,
          },
          fielding: {
            fieldingPct: 0,
            errors: 0,
            doublePlays: 0,
            assists: 0,
            putOuts: 0,
            chances: 0,
          },
          ranks: {},
        });
      } else if (teamName && teamMap.get(id).name === abbr) {
        teamMap.get(id).name = teamName;
      }
      return teamMap.get(id);
    };

    // 1. Standings
    for (const divRec of standRecords) {
      const leagueId = divRec?.league?.id;
      const divName = DIVISION_ID_TO_NAME[divRec?.division?.id] || '';
      const leagueAbbr = leagueId === 103 ? 'AL' : leagueId === 104 ? 'NL' : null;
      for (const tr of divRec?.teamRecords || []) {
        const entry = ensureTeam(tr?.team?.id, tr?.team?.name);
        if (!entry) continue;
        if (leagueAbbr) entry.league = leagueAbbr;
        if (divName) entry.division = divName;
        const w = toNum(tr.wins);
        const l = toNum(tr.losses);
        const gp = w + l;
        const rs = toNum(tr.runsScored);
        const ra = toNum(tr.runsAllowed);
        const splitRecs = tr?.records?.splitRecords || [];
        const homeSplit = splitRecs.find((s) => s.type === 'home');
        const awaySplit = splitRecs.find((s) => s.type === 'away');
        const l10Split = splitRecs.find((s) => s.type === 'lastTen');
        const pythDenom = Math.pow(Math.max(1, rs), 1.83) + Math.pow(Math.max(1, ra), 1.83);
        const pythWinPct = rs > 0 && ra > 0 ? Number((Math.pow(rs, 1.83) / pythDenom).toFixed(3)) : 0;

        entry.record = {
          wins: w,
          losses: l,
          winPct: toNum(tr.winningPercentage, gp > 0 ? Number((w / gp).toFixed(3)) : 0),
          gamesPlayed: gp,
          runsScored: rs,
          runsAllowed: ra,
          runDiff: toNum(tr.runDifferential, rs - ra),
          pythWinPct,
          streak: tr?.streak?.streakCode || '—',
          divRank: tr.divisionRank ? Number(tr.divisionRank) : null,
          gb: tr.divisionGamesBack || '—',
          homeRecord: homeSplit ? `${homeSplit.wins}-${homeSplit.losses}` : '—',
          awayRecord: awaySplit ? `${awaySplit.wins}-${awaySplit.losses}` : '—',
          lastTen: l10Split ? `${l10Split.wins}-${l10Split.losses}` : '—',
        };
      }
    }

    // 2. Team Hitting
    for (const sp of hitSplits) {
      const entry = ensureTeam(sp?.team?.id, sp?.team?.name);
      if (!entry) continue;
      const st = sp?.stat || {};
      const gp = toNum(st.gamesPlayed, entry.record.gamesPlayed);
      const runs = toNum(st.runs);
      entry.hitting = {
        gamesPlayed: gp,
        runs,
        runsPerGame: gp > 0 ? Number((runs / gp).toFixed(2)) : 0,
        hits: toNum(st.hits),
        doubles: toNum(st.doubles),
        triples: toNum(st.triples),
        homeRuns: toNum(st.homeRuns),
        rbi: toNum(st.rbi),
        stolenBases: toNum(st.stolenBases),
        baseOnBalls: toNum(st.baseOnBalls),
        strikeOuts: toNum(st.strikeOuts),
        avg: toNum(st.avg),
        obp: toNum(st.obp),
        slg: toNum(st.slg),
        ops: toNum(st.ops),
      };
      if (!entry.record.runsScored && runs > 0) entry.record.runsScored = runs;
      if (!entry.record.gamesPlayed && gp > 0) entry.record.gamesPlayed = gp;
    }

    // 3. Team Pitching
    for (const sp of pitchSplits) {
      const entry = ensureTeam(sp?.team?.id, sp?.team?.name);
      if (!entry) continue;
      const st = sp?.stat || {};
      const ipNum = parseInnings(st.inningsPitched);
      const so = toNum(st.strikeOuts);
      const bb = toNum(st.baseOnBalls);
      const gp = toNum(st.gamesPlayed, entry.record.gamesPlayed);
      const ra = toNum(st.runs, entry.record.runsAllowed);

      entry.pitching = {
        era: toNum(st.era),
        whip: toNum(st.whip),
        wins: toNum(st.wins, entry.record.wins),
        losses: toNum(st.losses, entry.record.losses),
        saves: toNum(st.saves),
        blownSaves: toNum(st.blownSaves),
        inningsPitched: st.inningsPitched || '0.0',
        strikeOuts: so,
        baseOnBalls: bb,
        homeRuns: toNum(st.homeRuns),
        avgAgainst: toNum(st.avg),
        kPer9: toNum(st.strikeoutsPer9Inn, ipNum > 0 ? Number(((so * 9) / ipNum).toFixed(2)) : 0),
        bbPer9: toNum(st.walksPer9Inn, ipNum > 0 ? Number(((bb * 9) / ipNum).toFixed(2)) : 0),
        kToBb: toNum(st.strikeoutWalkRatio, bb > 0 ? Number((so / bb).toFixed(2)) : 0),
        shutouts: toNum(st.shutouts),
        runsAllowed: ra,
        runsAllowedPerGame: gp > 0 ? Number((ra / gp).toFixed(2)) : 0,
      };
      if (!entry.record.runsAllowed && ra > 0) entry.record.runsAllowed = ra;
    }

    // 4. Team Fielding
    for (const sp of fieldSplits) {
      const entry = ensureTeam(sp?.team?.id, sp?.team?.name);
      if (!entry) continue;
      const st = sp?.stat || {};
      entry.fielding = {
        fieldingPct: toNum(st.fielding),
        errors: toNum(st.errors),
        doublePlays: toNum(st.doublePlays),
        assists: toNum(st.assists),
        putOuts: toNum(st.putOuts),
        chances: toNum(st.chances),
      };
    }

    const teams = Array.from(teamMap.values());

    // Recompute runDiff & pythWinPct if standings were missing
    for (const t of teams) {
      if (t.record.runsScored > 0 && t.record.runsAllowed > 0) {
        if (!t.record.runDiff && t.record.runsScored !== t.record.runsAllowed) {
          t.record.runDiff = t.record.runsScored - t.record.runsAllowed;
        }
        if (!t.record.pythWinPct) {
          const rs = t.record.runsScored;
          const ra = t.record.runsAllowed;
          const denom = Math.pow(rs, 1.83) + Math.pow(ra, 1.83);
          t.record.pythWinPct = Number((Math.pow(rs, 1.83) / denom).toFixed(3));
        }
      }
    }

    // Compute official 1–30 ranks across every key category
    const opsRanks = assignRanks(teams, (t) => t.hitting.ops, false);
    const runsRanks = assignRanks(teams, (t) => t.hitting.runs, false);
    const hrRanks = assignRanks(teams, (t) => t.hitting.homeRuns, false);
    const avgRanks = assignRanks(teams, (t) => t.hitting.avg, false);
    const eraRanks = assignRanks(teams, (t) => t.pitching.era, true);
    const whipRanks = assignRanks(teams, (t) => t.pitching.whip, true);
    const kPer9Ranks = assignRanks(teams, (t) => t.pitching.kPer9, false);
    const savesRanks = assignRanks(teams, (t) => t.pitching.saves, false);
    const fpctRanks = assignRanks(teams, (t) => t.fielding.fieldingPct, false);
    const runDiffRanks = assignRanks(teams, (t) => t.record.runDiff, false);
    const winPctRanks = assignRanks(teams, (t) => t.record.winPct, false);

    // Composite Power Score (lower rank sum = stronger all-around club: 40% Win%, 30% Run Diff, 15% OPS, 15% ERA)
    for (const t of teams) {
      const rWin = winPctRanks.get(t.teamId) || 15;
      const rDiff = runDiffRanks.get(t.teamId) || 15;
      const rOps = opsRanks.get(t.teamId) || 15;
      const rEra = eraRanks.get(t.teamId) || 15;
      t._powerScore = rWin * 0.4 + rDiff * 0.3 + rOps * 0.15 + rEra * 0.15;
      t.ranks = {
        ops: rOps,
        runs: runsRanks.get(t.teamId) || 30,
        hr: hrRanks.get(t.teamId) || 30,
        avg: avgRanks.get(t.teamId) || 30,
        era: rEra,
        whip: whipRanks.get(t.teamId) || 30,
        kPer9: kPer9Ranks.get(t.teamId) || 30,
        saves: savesRanks.get(t.teamId) || 30,
        fpct: fpctRanks.get(t.teamId) || 30,
        runDiff: rDiff,
        winPct: rWin,
      };
    }

    const powerRanks = assignRanks(teams, (t) => t._powerScore, true);
    for (const t of teams) {
      t.ranks.power = powerRanks.get(t.teamId) || 30;
      delete t._powerScore;
    }

    teams.sort((a, b) => a.ranks.power - b.ranks.power || b.record.winPct - a.record.winPct);

    // Compute league averages and headline leaders
    const count = Math.max(1, teams.length);
    const sum = (fn) => teams.reduce((acc, t) => acc + fn(t), 0);
    const leagueAvg = {
      ops: Number((sum((t) => t.hitting.ops) / count).toFixed(3)),
      avg: Number((sum((t) => t.hitting.avg) / count).toFixed(3)),
      runsPerGame: Number((sum((t) => t.hitting.runsPerGame) / count).toFixed(2)),
      homeRuns: Math.round(sum((t) => t.hitting.homeRuns) / count),
      totalHomeRuns: Math.round(sum((t) => t.hitting.homeRuns)),
      era: Number((sum((t) => t.pitching.era) / count).toFixed(2)),
      whip: Number((sum((t) => t.pitching.whip) / count).toFixed(2)),
      kPer9: Number((sum((t) => t.pitching.kPer9) / count).toFixed(2)),
      fieldingPct: Number((sum((t) => t.fielding.fieldingPct) / count).toFixed(3)),
      errors: Math.round(sum((t) => t.fielding.errors) / count),
    };

    const pickLeader = (sortFn) => {
      if (teams.length === 0) return null;
      const top = [...teams].sort(sortFn)[0];
      return { abbr: top.abbr, name: top.name };
    };

    const topOffenseTeam = [...teams].sort((a, b) => b.hitting.ops - a.hitting.ops)[0] || null;
    const topPitchingTeam = [...teams].sort((a, b) => a.pitching.era - b.pitching.era)[0] || null;
    const bestRunDiffTeam = [...teams].sort((a, b) => b.record.runDiff - a.record.runDiff)[0] || null;
    const topDefenseTeam = [...teams].sort((a, b) => b.fielding.fieldingPct - a.fielding.fieldingPct)[0] || null;

    const isHistorical = effectiveSeason < now.getFullYear();
    res.setHeader(
      'Cache-Control',
      isHistorical
        ? 's-maxage=86400, stale-while-revalidate=604800'
        : 's-maxage=900, stale-while-revalidate=1800'
    );

    return res.status(200).json({
      season: effectiveSeason,
      requestedSeason,
      autoFallback,
      teamCount: teams.length,
      leagueAvg,
      leaders: {
        topOffense: topOffenseTeam
          ? { abbr: topOffenseTeam.abbr, name: topOffenseTeam.name, ops: topOffenseTeam.hitting.ops, runsPerGame: topOffenseTeam.hitting.runsPerGame }
          : null,
        topPitching: topPitchingTeam
          ? { abbr: topPitchingTeam.abbr, name: topPitchingTeam.name, era: topPitchingTeam.pitching.era, whip: topPitchingTeam.pitching.whip }
          : null,
        bestRunDiff: bestRunDiffTeam
          ? { abbr: bestRunDiffTeam.abbr, name: bestRunDiffTeam.name, runDiff: bestRunDiffTeam.record.runDiff, wins: bestRunDiffTeam.record.wins, losses: bestRunDiffTeam.record.losses }
          : null,
        topDefense: topDefenseTeam
          ? { abbr: topDefenseTeam.abbr, name: topDefenseTeam.name, fieldingPct: topDefenseTeam.fielding.fieldingPct, errors: topDefenseTeam.fielding.errors }
          : null,
        topPower: pickLeader((a, b) => a.ranks.power - b.ranks.power),
      },
      teams,
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch MLB team stats: ${err.message}` });
  }
}
