import { createClient } from '@supabase/supabase-js';

const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

const ALL_MLB_TEAM_IDS = Object.keys(MLB_TEAM_ID_TO_ABBR).join(',');

function buildDynamicCycles() {
  const now = new Date();
  const latestStart = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const cycles = {};
  for (let i = 0; i < 4; i++) {
    const yr = latestStart - i;
    const key = `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
    cycles[key] = {
      start: i === 0 ? `${yr}-10-01` : `${yr}-11-01`,
      end: i === 0 ? `${yr + 1}-04-01` : `${yr + 1}-03-31`,
      live: i === 0,
    };
  }
  return { cycles, defaultKey: Object.keys(cycles)[0] };
}

function normalizePersonKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function initTeamMap() {
  const map = {};
  for (const abbr of Object.values(MLB_TEAM_ID_TO_ABBR)) {
    map[abbr] = {
      abbr,
      totalMillions: 0,
      signingsCount: 0,
      tradesCount: 0,
      totalMoves: 0,
    };
  }
  return map;
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'HotStoveTracker/2.8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  const { cycles, defaultKey } = buildDynamicCycles();
  const requested = String(req.query?.cycle || defaultKey);
  const cycleKey = cycles[requested] ? requested : defaultKey;
  const cycle = cycles[cycleKey];
  const totals = initTeamMap();

  // 1. Pull tracked MLB dollar figures & moves from Supabase within this offseason window
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbRowsCount = 0;

  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase
        .from('transactions')
        .select('id, status, is_major_league, move_type, player_name, to_team, team_a, team_b, total_value_millions, reported_at')
        .gte('reported_at', `${cycle.start}T00:00:00Z`)
        .lte('reported_at', `${cycle.end}T23:59:59Z`);

      if (Array.isArray(data) && data.length > 0) {
        dbRowsCount = data.length;
        const maxDealBySigningKey = new Map();

        for (const tx of data) {
          if (tx.status === 'VOIDED' || tx.is_major_league === false) continue;

          if (tx.move_type === 'TRADE') {
            if (cycle.live) {
              const clubs = Array.from(new Set([tx.team_a, tx.team_b].filter((c) => c && totals[c])));
              for (const c of clubs) {
                totals[c].tradesCount += 1;
                totals[c].totalMoves += 1;
              }
            }
            continue;
          }

          const teamKey = tx.to_team || tx.team_a;
          if (!teamKey || !totals[teamKey]) continue;

          if (cycle.live) {
            totals[teamKey].totalMoves += 1;
            if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
              totals[teamKey].signingsCount += 1;
            }
          }

          if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
            const val = Number(tx.total_value_millions || 0);
            if (val > 0) {
              const pKey = tx.player_name
                ? `${teamKey}:${normalizePersonKey(tx.player_name)}`
                : `${teamKey}:tx:${tx.id}`;
              const prev = maxDealBySigningKey.get(pKey) || 0;
              if (val > prev) {
                totals[teamKey].totalMillions += val - prev;
                maxDealBySigningKey.set(pKey, val);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Spending DB read warning:', err.message);
    }
  }

  // 2. For historical offseasons (not in Supabase), fetch official MLB Stats API transaction counts
  let dataSource = 'Live Supabase + MLB API';
  if (!cycle.live) {
    dataSource = 'Official MLB Stats API (Move Counts; MLB API does not publish salaries)';
    try {
      const url = `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${cycle.start}&endDate=${cycle.end}`;
      const r = await fetchWithTimeout(url, 5000);
      if (r.ok) {
        const json = await r.json();
        const rawTx = json?.transactions || [];
        const seenTrades = new Set();

        for (const tx of rawTx) {
          const toAbbr = MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] || null;
          const fromAbbr = MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] || null;
          const desc = (tx.description || '').toLowerCase();

          if (!toAbbr && !fromAbbr) continue;
          if (desc.includes('assigned to') || desc.includes('minor league')) continue;

          if (tx.typeCode === 'TR') {
            const tradeKey = `${tx.tradeId || tx.date}-${toAbbr || fromAbbr}`;
            if (!seenTrades.has(tradeKey)) {
              seenTrades.add(tradeKey);
              if (toAbbr && totals[toAbbr]) {
                totals[toAbbr].tradesCount += 1;
                totals[toAbbr].totalMoves += 1;
              }
            }
          } else if (['SFA', 'SGN'].includes(tx.typeCode) && toAbbr && totals[toAbbr]) {
            totals[toAbbr].signingsCount += 1;
            totals[toAbbr].totalMoves += 1;
          } else if (['CLW', 'DFA', 'REL', 'SE'].includes(tx.typeCode)) {
            const club = toAbbr || fromAbbr;
            if (club && totals[club]) totals[club].totalMoves += 1;
          }
        }
      }
    } catch (err) {
      return res.status(500).json({ error: `Failed to fetch historical MLB cycle: ${err.message}` });
    }
  }

  const teams = Object.values(totals)
    .map((t) => ({ ...t, totalMillions: Number(t.totalMillions.toFixed(2)) }))
    .sort(
      (a, b) =>
        b.totalMillions - a.totalMillions ||
        b.totalMoves - a.totalMoves ||
        b.signingsCount - a.signingsCount
    );

  const totalSpent = Number(teams.reduce((s, t) => s + t.totalMillions, 0).toFixed(2));
  const totalMoves = teams.reduce((s, t) => s + t.totalMoves, 0);

  return res.status(200).json({
    cycle: cycleKey,
    availableCycles: Object.keys(cycles),
    isLiveCycle: cycle.live,
    dataSource,
    dbRowsCount,
    totalSpent,
    totalMoves,
    teams,
  });
}
