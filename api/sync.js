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

const TEAM_NAME_PATTERNS = [
  ['los angeles angels', 'LAA'], ['angels', 'LAA'],
  ['arizona diamondbacks', 'ARI'], ['diamondbacks', 'ARI'], ['d-backs', 'ARI'],
  ['baltimore orioles', 'BAL'], ['orioles', 'BAL'],
  ['boston red sox', 'BOS'], ['red sox', 'BOS'],
  ['chicago cubs', 'CHC'], ['cubs', 'CHC'],
  ['cincinnati reds', 'CIN'], ['reds', 'CIN'],
  ['cleveland guardians', 'CLE'], ['guardians', 'CLE'],
  ['colorado rockies', 'COL'], ['rockies', 'COL'],
  ['detroit tigers', 'DET'], ['tigers', 'DET'],
  ['houston astros', 'HOU'], ['astros', 'HOU'],
  ['kansas city royals', 'KC'], ['royals', 'KC'],
  ['los angeles dodgers', 'LAD'], ['dodgers', 'LAD'],
  ['washington nationals', 'WSH'], ['nationals', 'WSH'], ['nats', 'WSH'],
  ['new york mets', 'NYM'], ['mets', 'NYM'],
  ['athletics', 'ATH'], ["a's", 'ATH'],
  ['pittsburgh pirates', 'PIT'], ['pirates', 'PIT'],
  ['san diego padres', 'SD'], ['padres', 'SD'],
  ['seattle mariners', 'SEA'], ['mariners', 'SEA'],
  ['san francisco giants', 'SF'], ['giants', 'SF'],
  ['st. louis cardinals', 'STL'], ['cardinals', 'STL'],
  ['tampa bay rays', 'TB'], ['rays', 'TB'],
  ['texas rangers', 'TEX'], ['rangers', 'TEX'],
  ['toronto blue jays', 'TOR'], ['blue jays', 'TOR'], ['jays', 'TOR'],
  ['minnesota twins', 'MIN'], ['twins', 'MIN'],
  ['philadelphia phillies', 'PHI'], ['phillies', 'PHI'],
  ['atlanta braves', 'ATL'], ['braves', 'ATL'],
  ['chicago white sox', 'CWS'], ['white sox', 'CWS'],
  ['miami marlins', 'MIA'], ['marlins', 'MIA'],
  ['new york yankees', 'NYY'], ['yankees', 'NYY'],
  ['milwaukee brewers', 'MIL'], ['brewers', 'MIL'],
];

function safeIsoDate(val) {
  if (!val) return new Date().toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectTeamFromText(text) {
  const lower = (text || '').toLowerCase();
  for (const [pattern, abbr] of TEAM_NAME_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i');
    if (regex.test(lower)) return abbr;
  }
  return null;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const force = req.query?.force === 'true' || req.body?.force === true;

  const { data: meta, error: metaError } = await supabase
    .from('sync_metadata')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (metaError) {
    return res.status(500).json({ error: `Supabase connection error: ${metaError.message}` });
  }

  if (!force && meta?.last_synced_at) {
    const elapsedMs = Date.now() - new Date(meta.last_synced_at).getTime();
    const cooldownMs = 5 * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return res.status(200).json({
        skipped: true,
        reason: 'Cooldown active',
        remainingSeconds: remainingSec,
        last_synced_at: meta.last_synced_at,
      });
    }
  }

  // Clean up malformed rows & remove any legacy third-party RSS entries so feed stays 100% official MLB facts
  try {
    await supabase.from('transactions').delete().eq('source_name', 'MLB Trade Rumors');
    await supabase.from('transactions').delete().like('external_id', 'mlbtr-%');
    await supabase.from('transactions').delete().is('to_team', null).is('from_team', null).is('team_a', null);
    await supabase.from('transactions').delete().ilike('headline', '%assigned to%');
    await supabase.from('transactions').delete().ilike('headline', '%&#%');
  } catch (cleanErr) {
    console.error('Cleanup warning:', cleanErr.message);
  }

  let addedCount = 0;

  // Official MLB Stats API Transactions — Strictly 30 MLB Teams Only (Last 30 Days)
  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${fmt(start)}&endDate=${fmt(end)}`
    );
    if (mlbRes.ok) {
      const mlbData = await mlbRes.json();
      const rawTx = mlbData?.transactions || [];

      const tradeGroups = new Map();
      const singleTx = [];
      const ALLOWED_SINGLE_CODES = new Set(['SFA', 'SGN', 'CLW', 'DFA', 'REL', 'SE', 'OUT', 'IL', 'CU', 'OPT', 'REC']);

      for (const tx of rawTx) {
        const toMlb = MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] || null;
        const fromMlb = MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] || null;
        const desc = tx.description || '';

        if (!toMlb && !fromMlb) continue;
        if (/\bassigned to\b/i.test(desc) && !/rehab assignment/i.test(desc)) continue;

        if (tx.typeCode === 'TR') {
          const key = tx.tradeId || `${tx.date}-${desc.slice(0, 40)}`;
          if (!tradeGroups.has(key)) tradeGroups.set(key, []);
          tradeGroups.get(key).push(tx);
        } else if (ALLOWED_SINGLE_CODES.has(tx.typeCode)) {
          if (['SFA', 'SGN', 'CLW', 'SE', 'CU', 'REC'].includes(tx.typeCode) && !toMlb) continue;
          singleTx.push({ ...tx, _toMlb: toMlb, _fromMlb: fromMlb });
        }
      }

      for (const tx of singleTx.slice(-140)) {
        const extId = `mlb-tx-${tx.id}`;
        const playerName = tx.person?.fullName || 'Unknown Player';
        const toTeam = tx._toMlb;
        const fromTeam = tx._fromMlb;
        const desc = decodeHtml(tx.description || `${tx.toTeam?.name || 'MLB'} transaction involving ${playerName}`);
        const isMinor = /minor league/i.test(desc);
        const moveType = ['DFA', 'CLW', 'REL', 'OUT', 'IL', 'CU', 'OPT', 'REC'].includes(tx.typeCode)
          ? 'DFA_WAIVER'
          : 'SIGNING';

        const { data: exists } = await supabase
          .from('transactions')
          .select('id')
          .eq('external_id', extId)
          .maybeSingle();

        if (!exists) {
          const { error: insertErr } = await supabase.from('transactions').insert({
            external_id: extId,
            status: 'OFFICIAL',
            move_type: moveType,
            is_major_league: !isMinor,
            headline: desc,
            source_name: 'MLB.com Official',
            source_url: 'https://www.mlb.com/transactions',
            reported_at: safeIsoDate(tx.date),
            official_date: tx.date || fmt(end),
            player_id: tx.person?.id || null,
            player_name: playerName,
            from_team: fromTeam,
            to_team: toTeam || fromTeam,
          });
          if (!insertErr) addedCount++;
        }
      }

      for (const [key, items] of tradeGroups.entries()) {
        const extId = `mlb-trade-${key}`;
        const { data: exists } = await supabase
          .from('transactions')
          .select('id')
          .eq('external_id', extId)
          .maybeSingle();

        if (exists) continue;

        const first = items[0];
        const teamA = MLB_TEAM_ID_TO_ABBR[first.toTeam?.id] || detectTeamFromText(first.toTeam?.name) || 'MLB';
        const teamB = MLB_TEAM_ID_TO_ABBR[first.fromTeam?.id] || detectTeamFromText(first.fromTeam?.name) || 'MLB';

        const teamAReceives = [];
        const teamBReceives = [];
        let hasMlbPlayer = false;

        for (const leg of items) {
          const dest = MLB_TEAM_ID_TO_ABBR[leg.toTeam?.id] || detectTeamFromText(leg.toTeam?.name);
          const entry = {
            playerId: leg.person?.id || null,
            playerName: leg.person?.fullName || 'Cash / PTBNL',
            position: 'MLB',
            level: leg.person?.id ? 'MLB / 40-Man' : 'Asset',
            statLine: '',
          };
          if (leg.person?.id) hasMlbPlayer = true;
          if (dest === teamA) teamAReceives.push(entry);
          else teamBReceives.push(entry);
        }

        const { error: insertErr } = await supabase.from('transactions').insert({
          external_id: extId,
          status: 'OFFICIAL',
          move_type: 'TRADE',
          is_major_league: hasMlbPlayer,
          headline: decodeHtml(first.description || `${teamA} and ${teamB} Complete Trade`),
          source_name: 'MLB.com Official',
          source_url: 'https://www.mlb.com/transactions',
          reported_at: safeIsoDate(first.date),
          official_date: first.date || fmt(end),
          to_team: teamA,
          from_team: teamB,
          team_a: teamA,
          team_a_receives: teamAReceives,
          team_b: teamB,
          team_b_receives: teamBReceives,
        });
        if (!insertErr) addedCount++;
      }
    }
  } catch (err) {
    console.error('MLB API sync warning:', err.message);
  }

  const nowIso = new Date().toISOString();
  const summary = `Synced official MLB feed: ${addedCount} new moves`;
  await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_synced_at: nowIso, last_sync_summary: summary });

  return res.status(200).json({
    skipped: false,
    addedCount,
    upgradedCount: 0,
    last_synced_at: nowIso,
    summary,
  });
}
