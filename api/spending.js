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

const CYCLES = {
  '2026-27': { start: '2026-10-01', end: '2027-04-01', live: true },
  '2025-26': { start: '2025-11-01', end: '2026-03-31', live: false },
  '2024-25': { start: '2024-11-01', end: '2025-03-31', live: false },
  '2023-24': { start: '2023-11-01', end: '2024-03-31', live: false },
};

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  const cycleKey = String(req.query?.cycle || '2026-27');
  const cycle = CYCLES[cycleKey] || CYCLES['2026-27'];
  const totals = initTeamMap();

  // 1. Pull any tracked dollar figures & moves from Supabase within this offseason window
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbRowsCount = 0;

  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase
        .from('transactions')
        .select('status, move_type, to_team, team_a, total_value_millions, reported_at')
        .gte('reported_at', `${cycle.start}T00:00:00Z`)
        .lte('reported_at', `${cycle.end}T23:59:59Z`);

      if (Array.isArray(data) && data.length > 0) {
        dbRowsCount = data.length;
        for (const tx of data) {
          if (tx.status === 'VOIDED') continue;
          const teamKey = tx.to_team || tx.team_a;
          if (!teamKey || !totals[teamKey]) continue;

          if (cycle.live) {
            totals[teamKey].totalMoves += 1;
            if (tx.move_type === 'TRADE') totals[teamKey].tradesCount += 1;
            if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
              totals[teamKey].signingsCount += 1;
            }
          }
          if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
            totals[teamKey].totalMillions += Number(tx.total_value_millions || 0);
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
      const r = await fetch(url);
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
    availableCycles: Object.keys(CYCLES),
    isLiveCycle: cycle.live,
    dataSource,
    dbRowsCount,
    totalSpent,
    totalMoves,
    teams,
  });
}
