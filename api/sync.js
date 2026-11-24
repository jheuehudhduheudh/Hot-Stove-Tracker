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

const ALLOWED_SINGLE_CODES = new Set([
  'SFA', 'SGN', 'EXT', 'CLW', 'DFA', 'DES', 'REL', 'SE', 'OUT',
  'IL', 'CU', 'OPT', 'REC', 'NT', 'RET', 'SC',
]);

const STATUS_CHANGE_ALLOW_RE =
  /(free agency|injured list|10-day il|15-day il|60-day il|reinstated|activated|non-tender|declined|exercised|opted out|retired|designated for assignment|claimed|outrighted|released|recalled|optioned|selected the contract|signed)/i;

/**
 * Converts MLB date-only strings ("YYYY-MM-DD") to noon UTC so they stay on the
 * exact official MLB date in all North American time zones (instead of shifting
 * back 1 day at midnight UTC in EST/PST).
 */
function safeIsoDate(val) {
  if (!val) return new Date().toISOString();
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T12:00:00.000Z`;
  }
  const d = new Date(str);
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

function extractPositionFromText(text) {
  const m = String(text || '').match(
    /\b(RHP|LHP|SP|RP|TWP|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|INF|UTL)\b/
  );
  return m ? m[1] : null;
}

function classifySingleMoveType(typeCode, desc) {
  const code = String(typeCode || '').toUpperCase();
  const lower = String(desc || '').toLowerCase();

  if (code === 'EXT' || /\b(contract extension|agreed to an extension|extended)\b/i.test(lower)) {
    return 'EXTENSION';
  }
  if (
    (code === 'SFA' || code === 'SGN') &&
    !/\b(elected free agency|declared free agency|released|designated for assignment)\b/i.test(lower)
  ) {
    return 'SIGNING';
  }
  if (
    /\b(signed free agent|re-signed|signed .* to a .* contract)\b/i.test(lower) &&
    !/\b(elected free agency|declared free agency)\b/i.test(lower)
  ) {
    return 'SIGNING';
  }
  return 'DFA_WAIVER';
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

  // Run lightweight cleanup in parallel (non-blocking if nothing to clean)
  try {
    await Promise.all([
      supabase.from('transactions').delete().eq('source_name', 'MLB Trade Rumors'),
      supabase.from('transactions').delete().like('external_id', 'mlbtr-%'),
      supabase.from('transactions').delete().is('to_team', null).is('from_team', null).is('team_a', null),
      supabase.from('transactions').delete().ilike('headline', '%&#%'),
    ]);
  } catch (cleanErr) {
    console.error('Cleanup warning:', cleanErr.message);
  }

  let addedCount = 0;

  // Official MLB Stats API Transactions — Strictly 30 MLB Teams Only (Last 30 Days + 1-day UTC buffer)
  try {
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${fmt(start)}&endDate=${fmt(end)}`,
      { headers: { 'User-Agent': 'HotStoveTracker/2.0' } }
    );

    if (!mlbRes.ok) {
      return res.status(502).json({
        error: `MLB Stats API returned HTTP ${mlbRes.status}`,
      });
    }

    const mlbData = await mlbRes.json();
    const rawTx = mlbData?.transactions || [];

    const tradeGroups = new Map();
    const singleTx = [];

    for (const tx of rawTx) {
      const toMlb = MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] || null;
      const fromMlb = MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] || null;
      const desc = tx.description || '';

      if (!toMlb && !fromMlb) continue;
      if (/\bassigned to\b/i.test(desc) && !/rehab assignment/i.test(desc)) continue;
      if (/\bchanged number\b|\bnumber change\b/i.test(desc)) continue;

      const code = String(tx.typeCode || '').toUpperCase();

      if (code === 'TR') {
        const key = tx.tradeId || `${tx.date || tx.effectiveDate || 'trade'}-${desc.slice(0, 40)}`;
        if (!tradeGroups.has(key)) tradeGroups.set(key, []);
        tradeGroups.get(key).push(tx);
      } else if (ALLOWED_SINGLE_CODES.has(code)) {
        if (code === 'SC' && !STATUS_CHANGE_ALLOW_RE.test(desc)) continue;
        if (['SFA', 'SGN', 'CLW', 'SE', 'CU', 'REC'].includes(code) && !toMlb) continue;
        singleTx.push({ ...tx, _toMlb: toMlb, _fromMlb: fromMlb });
      }
    }

    // Sort NEWEST FIRST so today's moves are always processed first and never sliced off
    singleTx.sort((a, b) => {
      const dateA = String(a.date || a.effectiveDate || '');
      const dateB = String(b.date || b.effectiveDate || '');
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return Number(b.id || 0) - Number(a.id || 0);
    });

    const rowsToUpsert = [];
    const seenExtIds = new Set();
    const todayFallback = new Date().toISOString().slice(0, 10);

    for (const tx of singleTx.slice(0, 400)) {
      const extId = `mlb-tx-${tx.id}`;
      if (seenExtIds.has(extId)) continue;
      seenExtIds.add(extId);

      const playerName = tx.person?.fullName || 'Unknown Player';
      const toTeam = tx._toMlb;
      const fromTeam = tx._fromMlb;
      const desc = decodeHtml(tx.description || `${tx.toTeam?.name || 'MLB'} transaction involving ${playerName}`);
      const isMinor = /\bminor league\b/i.test(desc);
      const txDate = tx.date || tx.effectiveDate || todayFallback;

      rowsToUpsert.push({
        external_id: extId,
        status: 'OFFICIAL',
        move_type: classifySingleMoveType(tx.typeCode, desc),
        is_major_league: !isMinor,
        headline: desc,
        source_name: 'MLB.com Official',
        source_url: 'https://www.mlb.com/transactions',
        reported_at: safeIsoDate(txDate),
        official_date: txDate,
        player_id: tx.person?.id || null,
        player_name: playerName,
        position: extractPositionFromText(desc),
        from_team: fromTeam,
        to_team: toTeam || fromTeam,
      });
    }

    for (const [key, items] of tradeGroups.entries()) {
      const extId = `mlb-trade-${key}`;
      if (seenExtIds.has(extId)) continue;
      seenExtIds.add(extId);

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
          position: extractPositionFromText(leg.description) || 'MLB',
          level: leg.person?.id ? 'MLB / 40-Man' : 'Asset',
          statLine: '',
        };
        if (leg.person?.id) hasMlbPlayer = true;
        if (dest === teamA) teamAReceives.push(entry);
        else teamBReceives.push(entry);
      }

      const tradeDate = first.date || first.effectiveDate || todayFallback;
      rowsToUpsert.push({
        external_id: extId,
        status: 'OFFICIAL',
        move_type: 'TRADE',
        is_major_league: hasMlbPlayer,
        headline: decodeHtml(first.description || `${teamA} and ${teamB} Complete Trade`),
        source_name: 'MLB.com Official',
        source_url: 'https://www.mlb.com/transactions',
        reported_at: safeIsoDate(tradeDate),
        official_date: tradeDate,
        to_team: teamA,
        from_team: teamB,
        team_a: teamA,
        team_a_receives: teamAReceives,
        team_b: teamB,
        team_b_receives: teamBReceives,
      });
    }

    // Batched upsert in chunks of 100 — finishes in <1s instead of timing out Vercel's 10s limit
    const CHUNK_SIZE = 100;
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
      const { data: inserted, error: upsertErr } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: true })
        .select('id');

      if (upsertErr) {
        console.error('Batch upsert error:', upsertErr.message);
      } else if (Array.isArray(inserted)) {
        addedCount += inserted.length;
      }
    }
  } catch (err) {
    return res.status(500).json({ error: `MLB API sync failed: ${err.message}` });
  }

  const nowIso = new Date().toISOString();
  const summary = `Synced official MLB feed: ${addedCount} new ${addedCount === 1 ? 'move' : 'moves'}`;
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
