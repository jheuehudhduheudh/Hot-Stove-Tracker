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

  const CATEGORY_ORDER = {
    battingAverage: 1,
    homeRuns: 2,
    runsBattedIn: 3,
    onBasePlusSlugging: 4,
    hits: 5,
    stolenBases: 6,
    earnedRunAverage: 1,
    wins: 2,
    strikeouts: 3,
    whip: 4,
    saves: 5,
    inningsPitched: 6,
  };

  const normalizeCat = (c) => {
    if (c === 'walksAndHitsPerInningPitched') return 'whip';
    return c;
  };

  const formatBoard = (list) =>
    (list || [])
      .map((cat) => ({
        category: normalizeCat(cat.leaderCategory),
        leaders: (cat.leaders || []).map((l) => ({
          rank: l.rank,
          value: l.value,
          playerId: l.person?.id,
          fullName: l.person?.fullName || 'Unknown',
          teamAbbr: MLB_TEAM_ID_TO_ABBR[l.team?.id] || l.team?.abbreviation || 'MLB',
        })),
      }))
      .sort((a, b) => (CATEGORY_ORDER[a.category] || 99) - (CATEGORY_ORDER[b.category] || 99));

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


function pickThumbnail(imageObj) {
  if (!imageObj) return null;
  const cuts = Array.isArray(imageObj.cuts)
    ? imageObj.cuts
    : imageObj.cuts && typeof imageObj.cuts === 'object'
    ? Object.values(imageObj.cuts)
    : [];
  if (cuts.length === 0) return null;
  // Prefer a crisp 16:9 medium thumbnail (~640px wide)
  const preferred =
    cuts.find((c) => Number(c?.width) >= 600 && Number(c?.width) <= 960 && c?.src) ||
    cuts.find((c) => Number(c?.width) >= 400 && c?.src) ||
    cuts.find((c) => c?.src);
  return preferred?.src || null;
}

function pickMp4Playback(playbacks) {
  if (!Array.isArray(playbacks)) return null;
  const mp4Avc = playbacks.find((p) => p?.name === 'mp4Avc' && p?.url);
  if (mp4Avc) return mp4Avc.url;
  const highBit = playbacks.find((p) => p?.name === 'highBit' && p?.url && /\.mp4/i.test(p.url));
  if (highBit) return highBit.url;
  const anyMp4 = playbacks.find((p) => p?.url && /\.mp4(\?|$)/i.test(p.url));
  if (anyMp4) return anyMp4.url;
  return null;
}

function parseHighlights(contentData) {
  const rawItems = [
    ...(contentData?.highlights?.highlights?.items || []),
  ];

  // Also check editorial MLB recap media if present
  const recapMedia = contentData?.editorial?.recap?.mlb?.media;
  if (recapMedia && recapMedia.playbacks) {
    rawItems.unshift(recapMedia);
  }

  const seen = new Set();
  const list = [];

  for (const item of rawItems) {
    if (!item || (item.type && item.type !== 'video')) continue;
    const headline = item.headline || item.title || '';
    if (!headline) continue;
    const key = item.id || item.guid || headline;
    if (seen.has(key)) continue;
    seen.add(key);

    const videoUrl = pickMp4Playback(item.playbacks);
    const mlbUrl = item.slug ? `https://www.mlb.com/video/${item.slug}` : null;
    if (!videoUrl && !mlbUrl) continue;

    const isRecap =
      /\b(condensed\s+game|recap|highlights\s*[:|–-]|\bvs\.?\b.*\bhighlights\b)/i.test(headline) ||
      (item.duration && /^00:(0[4-9]|[1-5]\d):/.test(String(item.duration)));

    list.push({
      id: String(key),
      headline,
      blurb: item.blurb || item.description || '',
      duration: item.duration || '',
      thumbnail: pickThumbnail(item.image),
      videoUrl,
      mlbUrl,
      isRecap: Boolean(isRecap),
    });
  }

  // Float full Game Recaps / Condensed Games to the top
  list.sort((a, b) => Number(b.isRecap) - Number(a.isRecap));
  return list.slice(0, 24);
}

function parseScoringPlays(pbpData) {
  const allPlays = pbpData?.allPlays || [];
  const indices = pbpData?.scoringPlays || [];
  const out = [];

  for (const idx of indices) {
    const play = allPlays[idx];
    if (!play) continue;
    const about = play.about || {};
    const result = play.result || {};
    const batter = play.matchup?.batter || {};
    out.push({
      atBatIndex: about.atBatIndex ?? idx,
      inning: about.inning ?? null,
      half: about.halfInning === 'top' ? 'Top' : about.halfInning === 'bottom' ? 'Bot' : '',
      event: result.event || 'Scoring Play',
      description: result.description || '',
      rbi: result.rbi ?? 0,
      awayScore: result.awayScore ?? null,
      homeScore: result.homeScore ?? null,
      batterId: batter.id || null,
      batterName: batter.fullName || '',
    });
  }
  return out;
}

async function handleBoxScore(req, res) {
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
  const gamePk = req.query?.gamePk;
  if (!gamePk || !/^\d+$/.test(String(gamePk))) {
    return res.status(400).json({ error: 'Valid numeric gamePk is required' });
  }

  const [boxRes, lineRes, schedRes, pbpRes, contentRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`).catch(() => null),
    fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=decisions,team,venue`).catch(() => null),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`).catch(() => null),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`).catch(() => null),
  ]);

  if (!boxRes.ok) {
    return res.status(boxRes.status).json({ error: `MLB boxscore API returned ${boxRes.status}` });
  }

  const [boxData, lineData, schedData, pbpData, contentData] = await Promise.all([
    boxRes.json(),
    lineRes && lineRes.ok ? lineRes.json().catch(() => ({})) : {},
    schedRes && schedRes.ok ? schedRes.json().catch(() => ({})) : {},
    pbpRes && pbpRes.ok ? pbpRes.json().catch(() => ({})) : {},
    contentRes && contentRes.ok ? contentRes.json().catch(() => ({})) : {},
  ]);

  const schedGame = schedData?.dates?.[0]?.games?.[0] || {};

  const parseSide = (sideData) => {
    const teamObj = sideData?.team || {};
    const playersMap = sideData?.players || {};
    const battersOrder = sideData?.batters || [];
    const pitchersOrder = sideData?.pitchers || [];

    const batters = battersOrder
      .map((id) => playersMap[`ID${id}`])
      .filter((p) => p && p.stats?.batting && Object.keys(p.stats.batting).length > 0)
      .map((p) => ({
        playerId: p.person?.id,
        fullName: p.person?.fullName || 'Unknown',
        position: p.position?.abbreviation || p.allPositions?.[0]?.abbreviation || '',
        battingOrder: p.battingOrder || '',
        isSub: Boolean(p.battingOrder && Number(p.battingOrder) % 100 !== 0),
        ab: p.stats.batting.atBats ?? 0,
        r: p.stats.batting.runs ?? 0,
        h: p.stats.batting.hits ?? 0,
        rbi: p.stats.batting.rbi ?? 0,
        bb: p.stats.batting.baseOnBalls ?? 0,
        so: p.stats.batting.strikeOuts ?? 0,
        hr: p.stats.batting.homeRuns ?? 0,
        avg: p.seasonStats?.batting?.avg || '—',
        ops: p.seasonStats?.batting?.ops || '—',
        summary: p.stats.batting.summary || '',
      }));

    const pitchers = pitchersOrder
      .map((id) => playersMap[`ID${id}`])
      .filter((p) => p && p.stats?.pitching && Object.keys(p.stats.pitching).length > 0)
      .map((p) => ({
        playerId: p.person?.id,
        fullName: p.person?.fullName || 'Unknown',
        note: p.stats.pitching.note || '',
        ip: p.stats.pitching.inningsPitched || '0.0',
        h: p.stats.pitching.hits ?? 0,
        r: p.stats.pitching.runs ?? 0,
        er: p.stats.pitching.earnedRuns ?? 0,
        bb: p.stats.pitching.baseOnBalls ?? 0,
        so: p.stats.pitching.strikeOuts ?? 0,
        hr: p.stats.pitching.homeRuns ?? 0,
        pitches: p.stats.pitching.numberOfPitches ?? null,
        strikes: p.stats.pitching.strikes ?? null,
        era: p.seasonStats?.pitching?.era || '—',
      }));

    const battingNotes = [];
    for (const blk of sideData?.info || []) {
      if (blk?.title === 'BATTING' && Array.isArray(blk.fieldList)) {
        for (const f of blk.fieldList) {
          if (['HR', '2B', '3B', 'TB', 'RBI'].includes(f.label)) {
            battingNotes.push({ label: f.label, value: f.value });
          }
        }
      }
    }

    return {
      id: teamObj.id,
      abbr: MLB_TEAM_ID_TO_ABBR[teamObj.id] || teamObj.abbreviation || 'MLB',
      name: teamObj.name || 'Team',
      teamBatting: sideData?.teamStats?.batting || {},
      teamPitching: sideData?.teamStats?.pitching || {},
      batters,
      pitchers,
      battingNotes,
    };
  };

  const innings = (lineData?.innings || []).map((inn) => ({
    num: inn.num,
    ordinal: inn.ordinalNum,
    awayRuns: inn.away?.runs ?? null,
    homeRuns: inn.home?.runs ?? null,
  }));

  const gameInfo = (boxData?.info || [])
    .filter((f) => ['Weather', 'Wind', 'First pitch', 'T', 'Att', 'Venue'].includes(f.label))
    .map((f) => ({ label: f.label, value: f.value }));

  const offense = lineData?.offense || {};
  const scoringPlays = parseScoringPlays(pbpData);
  const highlights = parseHighlights(contentData);

  return res.status(200).json({
    gamePk: Number(gamePk),
    status: schedGame?.status?.detailedState || (lineData?.currentInningOrdinal ? `${lineData.inningHalf || ''} ${lineData.currentInningOrdinal}` : 'Game Box Score'),
    abstractState: schedGame?.status?.abstractGameState || (lineData?.currentInning ? 'Live' : 'Preview'),
    venue: schedGame?.venue?.name || '',
    gameDate: schedGame?.gameDate || '',
    linescore: {
      currentInning: lineData?.currentInningOrdinal || null,
      inningHalf: lineData?.inningHalf || null,
      outs: lineData?.outs ?? null,
      balls: lineData?.balls ?? null,
      strikes: lineData?.strikes ?? null,
      onFirst: Boolean(offense.first),
      onSecond: Boolean(offense.second),
      onThird: Boolean(offense.third),
      innings,
      away: {
        runs: lineData?.teams?.away?.runs ?? null,
        hits: lineData?.teams?.away?.hits ?? null,
        errors: lineData?.teams?.away?.errors ?? null,
        lob: lineData?.teams?.away?.leftOnBase ?? null,
      },
      home: {
        runs: lineData?.teams?.home?.runs ?? null,
        hits: lineData?.teams?.home?.hits ?? null,
        errors: lineData?.teams?.home?.errors ?? null,
        lob: lineData?.teams?.home?.leftOnBase ?? null,
      },
    },
    decisions: {
      winner: schedGame?.decisions?.winner?.fullName || null,
      loser: schedGame?.decisions?.loser?.fullName || null,
      save: schedGame?.decisions?.save?.fullName || null,
    },
    away: parseSide(boxData?.teams?.away),
    home: parseSide(boxData?.teams?.home),
    scoringPlays,
    highlights,
    gameInfo,
  });
}

export default async function handler(req, res) {
  const type = String(req.query?.type || 'scores').toLowerCase();
  try {
    if (type === 'scores') return await handleScores(req, res);
    if (type === 'standings') return await handleStandings(req, res);
    if (type === 'leaders') return await handleLeaders(req, res);
    if (type === 'roster') return await handleRoster(req, res);
    if (type === 'boxscore') return await handleBoxScore(req, res);
    return res.status(400).json({ error: `Unknown season query type: ${type}` });
  } catch (err) {
    return res.status(500).json({ error: `Season API error: ${err.message}` });
  }
}
