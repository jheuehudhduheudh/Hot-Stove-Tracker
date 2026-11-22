const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

const ABBR_TO_MLB_TEAM_ID = Object.fromEntries(
  Object.entries(MLB_TEAM_ID_TO_ABBR).map(([id, abbr]) => [abbr, Number(id)])
);

const DIVISION_NAMES = {
  200: 'AL West',
  201: 'AL East',
  202: 'AL Central',
  203: 'NL West',
  204: 'NL East',
  205: 'NL Central',
};

function getDefaultSeason() {
  const now = new Date();
  const year = now.getFullYear();
  // Before March, default to previous completed season; March onward use current year
  return now.getMonth() < 2 ? year - 1 : year;
}

async function handleScores(req, res) {
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=90');
  const todayStr = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date || ''))
    ? String(req.query.date)
    : todayStr;

  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,decisions,probablePitcher,team`;
  const r = await fetch(url);
  if (!r.ok) return res.status(r.status).json({ error: `MLB schedule API returned ${r.status}` });
  const data = await r.json();

  const rawGames = data?.dates?.[0]?.games || [];
  const games = rawGames.map((g) => {
    const awayTeam = g.teams?.away;
    const homeTeam = g.teams?.home;
    const ls = g.linescore || {};
    const statusCode = g.status?.abstractGameState || 'Preview';
    return {
      gamePk: g.gamePk,
      gameDate: g.gameDate,
      gameType: g.gameType,
      status: g.status?.detailedState || statusCode,
      abstractState: statusCode,
      venue: g.venue?.name || '',
      inning: ls.currentInningOrdinal || null,
      inningHalf: ls.inningHalf || null,
      outs: ls.outs ?? null,
      away: {
        id: awayTeam?.team?.id,
        abbr: MLB_TEAM_ID_TO_ABBR[awayTeam?.team?.id] || awayTeam?.team?.abbreviation || 'AWY',
        name: awayTeam?.team?.name || 'Away',
        score: awayTeam?.score ?? null,
        wins: awayTeam?.leagueRecord?.wins ?? null,
        losses: awayTeam?.leagueRecord?.losses ?? null,
        hits: ls.teams?.away?.hits ?? null,
        errors: ls.teams?.away?.errors ?? null,
        probablePitcher: awayTeam?.probablePitcher?.fullName || null,
      },
      home: {
        id: homeTeam?.team?.id,
        abbr: MLB_TEAM_ID_TO_ABBR[homeTeam?.team?.id] || homeTeam?.team?.abbreviation || 'HME',
        name: homeTeam?.team?.name || 'Home',
        score: homeTeam?.score ?? null,
        wins: homeTeam?.leagueRecord?.wins ?? null,
        losses: homeTeam?.leagueRecord?.losses ?? null,
        hits: ls.teams?.home?.hits ?? null,
        errors: ls.teams?.home?.errors ?? null,
        probablePitcher: homeTeam?.probablePitcher?.fullName || null,
      },
      decisions: {
        winner: g.decisions?.winner?.fullName || null,
        loser: g.decisions?.loser?.fullName || null,
        save: g.decisions?.save?.fullName || null,
      },
    };
  });

  return res.status(200).json({ date, count: games.length, games });
}

async function handleStandings(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const season = /^\d{4}$/.test(String(req.query?.season || ''))
    ? Number(req.query.season)
    : getDefaultSeason();

  const [divRes, wcRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team,division`),
    fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=wildCard&hydrate=team,division`),
  ]);

  if (!divRes.ok) return res.status(divRes.status).json({ error: `MLB standings API returned ${divRes.status}` });

  const divData = await divRes.json();
  const wcData = wcRes.ok ? await wcRes.json() : { records: [] };

  const formatTeamRecord = (rec) => {
    const splits = rec.records?.splitRecords || [];
    const l10 = splits.find((s) => s.type === 'lastTen');
    const home = splits.find((s) => s.type === 'home');
    const away = splits.find((s) => s.type === 'away');
    return {
      teamId: rec.team?.id,
      abbr: MLB_TEAM_ID_TO_ABBR[rec.team?.id] || rec.team?.abbreviation || 'MLB',
      name: rec.team?.name || '',
      wins: rec.wins ?? 0,
      losses: rec.losses ?? 0,
      pct: rec.winningPercentage || '.000',
      gb: rec.gamesBack || '-',
      wcGb: rec.wildCardGamesBack || '-',
      wcRank: rec.wildCardRank ? Number(rec.wildCardRank) : null,
      divRank: rec.divisionRank ? Number(rec.divisionRank) : null,
      streak: rec.streak?.streakCode || '-',
      lastTen: l10 ? `${l10.wins}-${l10.losses}` : '-',
      homeRecord: home ? `${home.wins}-${home.losses}` : '-',
      awayRecord: away ? `${away.wins}-${away.losses}` : '-',
      runDiff: rec.runDifferential ?? 0,
      runsScored: rec.runsScored ?? 0,
      runsAllowed: rec.runsAllowed ?? 0,
      clinched: Boolean(rec.clinched),
      clinchIndicator: rec.clinchIndicator || null,
    };
  };

  const divisions = (divData?.records || []).map((block) => ({
    divisionId: block.division?.id,
    divisionName: DIVISION_NAMES[block.division?.id] || block.division?.name || 'Division',
    league: block.league?.id === 103 ? 'AL' : 'NL',
    teams: (block.teamRecords || []).map(formatTeamRecord),
  }));

  const wildCard = (wcData?.records || []).map((block) => ({
    league: block.league?.id === 103 ? 'AL' : 'NL',
    leagueName: block.league?.id === 103 ? 'American League Wild Card' : 'National League Wild Card',
    teams: (block.teamRecords || []).map(formatTeamRecord),
  }));

  return res.status(200).json({ season, divisions, wildCard });
}

async function handleLeaders(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  const season = /^\d{4}$/.test(String(req.query?.season || ''))
    ? Number(req.query.season)
    : getDefaultSeason();

  const hittingCats = 'homeRuns,battingAverage,onBasePlusSlugging,runsBattedIn,stolenBases,hits';
  const pitchingCats = 'earnedRunAverage,whip,strikeouts,saves,wins,inningsPitched';

  const [hitRes, pitchRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${hittingCats}&season=${season}&statGroup=hitting&limit=10`),
    fetch(`https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${pitchingCats}&season=${season}&statGroup=pitching&limit=10`),
  ]);

  const hitData = hitRes.ok ? await hitRes.json() : { leagueLeaders: [] };
  const pitchData = pitchRes.ok ? await pitchRes.json() : { leagueLeaders: [] };

  const formatBoard = (list) =>
    (list || []).map((cat) => ({
      category: cat.leaderCategory,
      leaders: (cat.leaders || []).map((l) => ({
        rank: l.rank,
        value: l.value,
        playerId: l.person?.id,
        fullName: l.person?.fullName || 'Unknown',
        teamAbbr: MLB_TEAM_ID_TO_ABBR[l.team?.id] || l.team?.abbreviation || 'MLB',
      })),
    }));

  return res.status(200).json({
    season,
    hitting: formatBoard(hitData.leagueLeaders),
    pitching: formatBoard(pitchData.leagueLeaders),
  });
}

async function handleRoster(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  const abbr = String(req.query?.team || '').toUpperCase().trim();
  const teamId = req.query?.teamId ? Number(req.query.teamId) : ABBR_TO_MLB_TEAM_ID[abbr];

  if (!teamId || !MLB_TEAM_ID_TO_ABBR[teamId]) {
    return res.status(400).json({ error: 'Valid MLB team abbreviation or teamId is required' });
  }

  const season = /^\d{4}$/.test(String(req.query?.season || ''))
    ? Number(req.query.season)
    : getDefaultSeason();

  const [activeRes, fortyRes, standingsRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&hydrate=person`),
    fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man&hydrate=person`),
    fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`),
  ]);

  const activeJson = activeRes.ok ? await activeRes.json() : { roster: [] };
  const fortyJson = fortyRes.ok ? await fortyRes.json() : { roster: [] };
  const standingsJson = standingsRes.ok ? await standingsRes.json() : { records: [] };

  const activeRaw = activeJson.roster || [];
  const fortyRaw = fortyJson.roster || [];
  const primaryList = activeRaw.length > 0 ? activeRaw : fortyRaw;
  const rosterSource = activeRaw.length > 0 ? '26-Man Active' : '40-Man Roster';

  const mapPlayer = (r) => ({
    playerId: r.person?.id,
    fullName: r.person?.fullName || 'Unknown',
    jerseyNumber: r.jerseyNumber || '',
    position: r.position?.abbreviation || 'MLB',
    positionType: r.position?.type || '',
    statusCode: r.status?.code || 'A',
    statusDescription: r.status?.description || 'Active',
    age: r.person?.currentAge || '—',
    bats: r.person?.batSide?.code || '',
    throws: r.person?.pitchHand?.code || '',
  });

  const activePlayers = primaryList.map(mapPlayer);

  // Pull Injured List players from 40-man (and active list if any)
  const ilMap = new Map();
  for (const raw of [...fortyRaw, ...activeRaw]) {
    const code = raw.status?.code || '';
    const desc = (raw.status?.description || '').toLowerCase();
    if (
      /^D\d+$/i.test(code) ||
      desc.includes('injured') ||
      desc.includes('il') ||
      code === 'IL'
    ) {
      if (raw.person?.id) ilMap.set(raw.person.id, mapPlayer(raw));
    }
  }
  const injuredList = Array.from(ilMap.values());

  // Group players by depth-chart bucket
  const depthChart = { C: [], IF: [], OF: [], P: [] };
  for (const p of activePlayers) {
    if (p.position === 'C') depthChart.C.push(p);
    else if (['1B', '2B', '3B', 'SS', 'IF', 'DH', 'UT'].includes(p.position)) depthChart.IF.push(p);
    else if (['LF', 'CF', 'RF', 'OF'].includes(p.position)) depthChart.OF.push(p);
    else depthChart.P.push(p);
  }

  // Locate team's record for the season
  let record = null;
  for (const div of standingsJson.records || []) {
    const match = (div.teamRecords || []).find((tr) => tr.team?.id === teamId);
    if (match) {
      record = {
        season,
        wins: match.wins ?? 0,
        losses: match.losses ?? 0,
        pct: match.winningPercentage || '.000',
        gb: match.gamesBack || '-',
        divRank: match.divisionRank || '-',
        streak: match.streak?.streakCode || '-',
        runDiff: match.runDifferential ?? 0,
      };
      break;
    }
  }

  return res.status(200).json({
    teamId,
    abbr: MLB_TEAM_ID_TO_ABBR[teamId],
    rosterSource,
    record,
    activeCount: activePlayers.length,
    ilCount: injuredList.length,
    activePlayers,
    injuredList,
    depthChart,
  });
}

export default async function handler(req, res) {
  const type = String(req.query?.type || 'scores').toLowerCase();
  try {
    if (type === 'scores') return await handleScores(req, res);
    if (type === 'standings') return await handleStandings(req, res);
    if (type === 'leaders') return await handleLeaders(req, res);
    if (type === 'roster') return await handleRoster(req, res);
    return res.status(400).json({ error: `Unknown season query type: ${type}` });
  } catch (err) {
    return res.status(500).json({ error: `Season API error: ${err.message}` });
  }
}
