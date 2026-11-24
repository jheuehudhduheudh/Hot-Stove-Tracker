const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

// Lightweight in-memory cache for Savant CSV tables (persists across warm serverless invocations)
const SAVANT_CACHE = new Map();
const SAVANT_TTL_MS = 6 * 60 * 60 * 1000;

function parseCsv(text) {
  const lines = (text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = splitLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j] ?? '';
    }
    rows.push(obj);
  }
  return rows;
}

async function fetchSavantCsvMap(cacheKey, url) {
  const cached = SAVANT_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < SAVANT_TTL_MS) {
    return cached.map;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3800);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HotStoveTracker/1.6' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const rows = parseCsv(text);
    const map = new Map();
    for (const r of rows) {
      const pid = String(r.player_id || '').trim();
      if (pid) map.set(pid, r);
    }
    if (map.size > 0) {
      SAVANT_CACHE.set(cacheKey, { ts: Date.now(), map });
    }
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toNum(val) {
  if (val === undefined || val === null || val === '' || val === 'NaN') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function fetchPlayerSavant(playerId, year, isPitcher) {
  const yrNum = Number(year);
  if (!Number.isFinite(yrNum) || yrNum < 2015) {
    return { year: yrNum || null, available: false, reason: 'Statcast tracking began in 2015.' };
  }

  const savantType = isPitcher ? 'pitcher' : 'batter';
  const pctUrl = `https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=${savantType}&year=${yrNum}&csv=true`;
  const expUrl = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=${savantType}&year=${yrNum}&position=&team=&min=1&csv=true`;

  const [pctMap, expMap] = await Promise.all([
    fetchSavantCsvMap(`pct-${savantType}-${yrNum}`, pctUrl),
    fetchSavantCsvMap(`exp-${savantType}-${yrNum}`, expUrl),
  ]);

  const pidStr = String(playerId);
  const pctRow = pctMap?.get(pidStr) || null;
  const expRow = expMap?.get(pidStr) || null;

  if (!pctRow && !expRow) {
    return {
      year: yrNum,
      available: false,
      reason: `No Baseball Savant Statcast data available for ${yrNum}.`,
    };
  }

  const metricDefs = isPitcher
    ? [
        ['xera', 'xERA'],
        ['xwoba', 'xwOBA Allowed'],
        ['fb_velocity', 'Fastball Velo'],
        ['exit_velocity', 'Avg Exit Velo'],
        ['chase_percent', 'Chase %'],
        ['whiff_percent', 'Whiff %'],
        ['k_percent', 'K %'],
        ['bb_percent', 'BB %'],
        ['brl_percent', 'Barrel %'],
        ['hard_hit_percent', 'Hard-Hit %'],
        ['fb_spin', 'Fastball Spin'],
        ['extension', 'Extension'],
      ]
    : [
        ['xwoba', 'xwOBA'],
        ['xba', 'xBA'],
        ['xslg', 'xSLG'],
        ['exit_velocity', 'Avg Exit Velo'],
        ['brl_percent', 'Barrel %'],
        ['hard_hit_percent', 'Hard-Hit %'],
        ['bat_speed', 'Bat Speed'],
        ['squared_up_rate', 'Squared-Up %'],
        ['chase_percent', 'Chase %'],
        ['whiff_percent', 'Whiff %'],
        ['k_percent', 'K %'],
        ['bb_percent', 'BB %'],
        ['sprint_speed', 'Sprint Speed'],
        ['oaa', 'Fielding (OAA)'],
        ['arm_strength', 'Arm Strength'],
      ];

  const percentiles = [];
  if (pctRow) {
    for (const [col, label] of metricDefs) {
      const val = toNum(pctRow[col]);
      if (val !== null) {
        percentiles.push({ key: col, label, value: Math.round(val) });
      }
    }
  }

  const expected = expRow
    ? {
        pa: toNum(expRow.pa),
        bip: toNum(expRow.bip),
        ba: expRow.ba || null,
        xba: expRow.est_ba || null,
        baDiff: expRow.est_ba_minus_ba_diff || null,
        slg: expRow.slg || null,
        xslg: expRow.est_slg || null,
        slgDiff: expRow.est_slg_minus_slg_diff || null,
        woba: expRow.woba || null,
        xwoba: expRow.est_woba || null,
        wobaDiff: expRow.est_woba_minus_woba_diff || null,
        era: expRow.era || null,
        xera: expRow.xera || null,
        eraDiff: expRow.era_minus_xera_diff || null,
      }
    : null;

  return {
    year: yrNum,
    available: percentiles.length > 0 || Boolean(expected),
    percentiles,
    expected,
  };
}

function mapSeasonSplits(block) {
  const rows = (block?.splits || [])
    .filter((sp) => sp.season && sp.stat)
    .map((sp, idx) => {
      const isCombined = Boolean((!sp.team && sp.numTeams) || (sp.numTeams && sp.numTeams > 1));
      return {
        season: String(sp.season),
        team: isCombined
          ? `${sp.numTeams} TM`
          : MLB_TEAM_ID_TO_ABBR[sp.team?.id] ||
            sp.team?.abbreviation ||
            sp.team?.name?.slice(0, 3).toUpperCase() ||
            'MLB',
        isCombined,
        _idx: idx,
        stat: sp.stat,
      };
    });

  // Sort newest season first; within the same season, put the combined multi-team total row FIRST
  rows.sort((a, b) => {
    const yrDiff = Number(b.season) - Number(a.season);
    if (yrDiff !== 0) return yrDiff;
    if (a.isCombined !== b.isCombined) return a.isCombined ? -1 : 1;
    return a._idx - b._idx;
  });

  return rows.map(({ _idx, ...rest }) => rest);
}

function extractGroupStats(statsArray, groupName) {
  const arr = statsArray || [];
  const yby = arr.find(
    (s) =>
      (s?.group?.displayName || '').toLowerCase() === groupName &&
      (s?.type?.displayName || '').toLowerCase() === 'yearbyyear'
  );
  const career = arr.find(
    (s) =>
      (s?.group?.displayName || '').toLowerCase() === groupName &&
      (s?.type?.displayName || '').toLowerCase() === 'career'
  );
  return {
    seasons: mapSeasonSplits(yby),
    career: career?.splits?.[0]?.stat || null,
  };
}

const SPLIT_ORDER = { h: 1, a: 2, vl: 3, vr: 4 };

function extractSitSplits(statsArray, groupName) {
  const block = (statsArray || []).find(
    (s) =>
      (s?.group?.displayName || '').toLowerCase() === groupName &&
      (s?.type?.displayName || '').toLowerCase() === 'statsplits'
  );

  // MLB returns separate rows per team PLUS a combined season total row for traded players.
  // Group by split.code and keep ONLY the combined season total (or single-team row) to prevent duplicate rows.
  const byCode = new Map();
  for (const sp of block?.splits || []) {
    const code = sp?.split?.code;
    if (!code || !sp.split?.description || !sp.stat) continue;

    const isCombined = Boolean(!sp.team || (sp.numTeams && sp.numTeams > 1));
    const entry = {
      code,
      label: sp.split.description,
      team: isCombined
        ? (sp.numTeams && sp.numTeams > 1 ? `${sp.numTeams} TM` : 'Total')
        : (MLB_TEAM_ID_TO_ABBR[sp.team?.id] || sp.team?.abbreviation || 'MLB'),
      isCombined,
      stat: sp.stat,
    };

    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, entry);
    } else if (isCombined && !existing.isCombined) {
      byCode.set(code, entry);
    } else if (isCombined === existing.isCombined) {
      // Fallback if neither flags numTeams: prefer the row with larger sample (PA / AB / IP)
      const curSample =
        Number(sp.stat.plateAppearances || 0) ||
        Number(sp.stat.atBats || 0) ||
        parseFloat(sp.stat.inningsPitched || 0);
      const prevSample =
        Number(existing.stat.plateAppearances || 0) ||
        Number(existing.stat.atBats || 0) ||
        parseFloat(existing.stat.inningsPitched || 0);
      if (curSample > prevSample) {
        byCode.set(code, entry);
      }
    }
  }

  return Array.from(byCode.values()).sort(
    (a, b) => (SPLIT_ORDER[a.code] || 99) - (SPLIT_ORDER[b.code] || 99)
  );
}

async function handleSearch(q, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const trimmed = String(q || '').trim();
  if (trimmed.length < 2) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(trimmed)}&hydrate=currentTeam`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: `MLB search API returned ${r.status}` });
    }
    const data = await r.json();
    const people = data?.people || [];

    // Exclude minor-league / unranked prospects (players who have never debuted in MLB),
    // while keeping active, retired, older, and discontinued-team MLB players.
    // For discontinued or unavailable teams, omit teamAbbr & teamName cleanly (null).
    const results = people
      .filter((p) => Boolean(p?.id && p?.fullName && p?.mlbDebutDate))
      .map((p) => {
        const activeTeamAbbr = MLB_TEAM_ID_TO_ABBR[p.currentTeam?.id] || null;
        return {
          id: p.id,
          fullName: p.fullName || 'Unknown',
          position: p.primaryPosition?.abbreviation || 'MLB',
          age: p.currentAge || null,
          active: Boolean(p.active),
          mlbDebutDate: p.mlbDebutDate || '',
          isProspect: false,
          teamAbbr: activeTeamAbbr,
          teamName: activeTeamAbbr ? (p.currentTeam?.name || null) : null,
        };
      })
      .sort((a, b) => {
        const aRank = a.active && a.teamAbbr ? 3 : a.active ? 2 : 1;
        const bRank = b.active && b.teamAbbr ? 3 : b.active ? 2 : 1;
        if (bRank !== aRank) return bRank - aRank;
        return (b.mlbDebutDate || '').localeCompare(a.mlbDebutDate || '');
      })
      .slice(0, 12);

    return res.status(200).json({ query: trimmed, results });
  } catch (err) {
    return res.status(500).json({ error: `Player search failed: ${err.message}` });
  }
}

export default async function handler(req, res) {
  if (req.query?.q) {
    return handleSearch(req.query.q, res);
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const playerId = req.query?.id;
  if (!playerId || !/^\d+$/.test(String(playerId))) {
    return res.status(400).json({ error: 'Valid numeric MLB player id or search query q is required' });
  }

  try {
    const [personRes, postRes] = await Promise.all([
      fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[yearByYear,career])`
      ),
      fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=yearByYear,career&group=hitting,pitching&gameType=P`
      ).catch(() => null),
    ]);

    if (!personRes.ok) {
      return res.status(personRes.status).json({ error: `MLB API returned ${personRes.status}` });
    }

    const data = await personRes.json();
    const person = data?.people?.[0];
    if (!person) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const postData = postRes && postRes.ok ? await postRes.json() : { stats: [] };

    const posAbbr = person.primaryPosition?.abbreviation || 'MLB';
    const isPitcher =
      person.primaryPosition?.type === 'Pitcher' ||
      ['P', 'SP', 'RP', 'RHP', 'LHP'].includes(posAbbr);

    const hitting = extractGroupStats(person.stats, 'hitting');
    const pitching = extractGroupStats(person.stats, 'pitching');
    const postseason = {
      hitting: extractGroupStats(postData.stats, 'hitting'),
      pitching: extractGroupStats(postData.stats, 'pitching'),
    };

    const primaryStats = isPitcher ? pitching : hitting;
    const latestSeason = primaryStats.seasons?.[0]?.season || String(new Date().getFullYear());
    const requestedSavantYear = /^\d{4}$/.test(String(req.query?.savantYear || ''))
      ? String(req.query.savantYear)
      : latestSeason;
    const requestedSplitsYear = /^\d{4}$/.test(String(req.query?.splitsYear || ''))
      ? String(req.query.splitsYear)
      : latestSeason;
    const savantIsPitcher =
      req.query?.savantGroup === 'pitching'
        ? true
        : req.query?.savantGroup === 'hitting'
        ? false
        : isPitcher;

    // Fetch Situational Splits + Baseball Savant Statcast in parallel
    const [splitsRes, savant] = await Promise.all([
      fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=statSplits&group=hitting,pitching&season=${requestedSplitsYear}&sitCodes=vl,vr,h,a`
      ).catch(() => null),
      fetchPlayerSavant(playerId, requestedSavantYear, savantIsPitcher),
    ]);

    const splitsJson = splitsRes && splitsRes.ok ? await splitsRes.json() : { stats: [] };
    const splits = {
      season: requestedSplitsYear,
      hitting: extractSitSplits(splitsJson.stats, 'hitting'),
      pitching: extractSitSplits(splitsJson.stats, 'pitching'),
    };

    const isTwoWay =
      (hitting.seasons.some((s) => Number(s.stat?.atBats || 0) >= 30) &&
        pitching.seasons.some((s) => parseFloat(s.stat?.inningsPitched || 0) >= 15)) ||
      posAbbr === 'TWP';

    const currentTeamAbbr = MLB_TEAM_ID_TO_ABBR[person.currentTeam?.id] || null;
    const birthPlace = [person.birthCity, person.birthStateProvince, person.birthCountry]
      .filter(Boolean)
      .join(', ');

    return res.status(200).json({
      id: person.id,
      fullName: person.fullName,
      nickName: person.nickName || '',
      primaryNumber: person.primaryNumber || '',
      position: posAbbr,
      positionName: person.primaryPosition?.name || posAbbr,
      isPitcher,
      isTwoWay,
      active: Boolean(person.active),
      isProspect: !Boolean(person.mlbDebutDate),
      currentTeamAbbr,
      currentTeamName: currentTeamAbbr ? (person.currentTeam?.name || null) : null,
      age: person.currentAge || '—',
      birthDate: person.birthDate || '',
      birthPlace,
      bats: person.batSide?.code || '—',
      throws: person.pitchHand?.code || '—',
      height: person.height || '',
      weight: person.weight || '',
      mlbDebutDate: person.mlbDebutDate || '',
      draftYear: person.draftYear || null,
      // Backward-compatible primary fields + full multi-group profile
      seasons: primaryStats.seasons,
      career: primaryStats.career,
      hitting,
      pitching,
      postseason,
      splits,
      savant,
      links: {
        mlb: `https://www.mlb.com/player/${person.id}`,
        savant: `https://baseballsavant.mlb.com/savant-player/${person.id}`,
        bref: `https://www.baseball-reference.com/search/search.fcgi?search=${encodeURIComponent(person.fullName)}`,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch player profile: ${err.message}` });
  }
}
