import { createClient } from '@supabase/supabase-js';

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

// Noise-only MLB transaction codes (blocklist approach ensures no real MLB move is ever dropped)
const IGNORED_TYPE_CODES = new Set(['NUM', 'ASG']);

// Explicit minor-league text markers
const EXPLICIT_MILB_RE =
  /\b(minor league|minor-league|minor league phase|dominican summer league|arizona complex league|florida complex league|dsl|acl|fcl)\b/i;

// Explicit MLB 40-man / active roster transactions (always Major League unless EXPLICIT_MILB_RE matches)
const MLB_ROSTER_ACTION_RE =
  /\b(designated for assignment|claimed .* off waivers|selected the contract|purchased the contract|recalled|optioned|sent .* outright|outrighted|non-tendered|10-day injured list|15-day injured list|60-day injured list|10-day il|15-day il|60-day il|rehab assignment|activated|reinstated|qualifying offer|contract extension|agreed to an extension|exercised .* option|declined .* option|opted out|rule 5 draft)\b/i;

const MLB_ROSTER_ACTION_CODES = new Set(['CLW', 'DFA', 'DES', 'OUT', 'IL', 'CU', 'OPT', 'REC', 'SE', 'NT', 'EXT', 'PUR', 'DR5']);

function stableHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Converts MLB date-only strings ("YYYY-MM-DD") to noon UTC so they stay on the
 * exact official MLB date in all North American time zones (EST/CST/MST/PST).
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

function detectAllTeamsFromText(text) {
  const lower = (text || '').toLowerCase();
  const found = [];
  for (const [pattern, abbr] of TEAM_NAME_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i');
    const match = regex.exec(lower);
    if (match) {
      found.push({ abbr, index: match.index });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const unique = [];
  for (const item of found) {
    if (!unique.includes(item.abbr)) unique.push(item.abbr);
  }
  return unique;
}

function detectTeamFromText(text) {
  return detectAllTeamsFromText(text)[0] || null;
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
    /\b(claimed .* off waivers|designated for assignment|sent .* outright|outrighted|released|non-tendered|elected free agency|declared free agency|injured list|10-day il|15-day il|60-day il|rehab assignment|recalled|optioned|selected the contract|purchased the contract|activated|reinstated|retired)\b/i.test(lower)
  ) {
    return 'DFA_WAIVER';
  }
  if (
    code === 'SFA' ||
    code === 'SGN' ||
    /\b(signed free agent|re-signed|signed .* to a .* contract|signed)\b/i.test(lower)
  ) {
    return 'SIGNING';
  }
  return 'DFA_WAIVER';
}

function isTradeTransaction(tx) {
  const code = String(tx?.typeCode || '').toUpperCase();
  const desc = String(tx?.description || '');
  return code === 'TR' || /\btraded\b/i.test(desc);
}

function isNoiseTransaction(tx, desc) {
  const code = String(tx?.typeCode || '').toUpperCase();
  if (!desc) return true;
  if (IGNORED_TYPE_CODES.has(code) && !/rehab assignment/i.test(desc)) return true;
  if (/\bassigned to\b/i.test(desc) && !/rehab assignment/i.test(desc)) return true;
  if (/\bchanged number\b|\bnumber change\b|\buniform number\b/i.test(desc)) return true;
  return false;
}

async function hydratePeopleById(playerIds) {
  const uniqueIds = Array.from(
    new Set(playerIds.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0))
  );
  const map = new Map();
  if (uniqueIds.length === 0) return map;

  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    chunks.push(uniqueIds.slice(i, i + 100));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1/people?personIds=${chunk.join(',')}&hydrate=currentTeam`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'HotStoveTracker/2.2' },
          }
        );
        if (!res.ok) return;
        const json = await res.json();
        for (const p of json?.people || []) {
          if (p?.id) map.set(Number(p.id), p);
        }
      } catch {
        // Non-fatal: fall back gracefully
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return map;
}

async function fetchFortyManIdsForTeams(teamAbbrs) {
  const teamIds = Array.from(
    new Set(teamAbbrs.map((abbr) => ABBR_TO_MLB_TEAM_ID[abbr]).filter(Boolean))
  );
  const fortyManSet = new Set();
  if (teamIds.length === 0) return fortyManSet;

  await Promise.all(
    teamIds.map(async (teamId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'HotStoveTracker/2.2' },
          }
        );
        if (!res.ok) return;
        const json = await res.json();
        for (const entry of json?.roster || []) {
          const pid = Number(entry?.person?.id);
          if (Number.isInteger(pid) && pid > 0) fortyManSet.add(pid);
        }
      } catch {
        // Non-fatal
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return fortyManSet;
}

// Guarantees every row in a PostgREST batch upsert has the exact same set of keys
// (prevents PGRST102 "All object keys must match" errors).
function buildNormalizedRow({
  external_id,
  move_type,
  is_major_league,
  headline,
  reported_at,
  official_date,
  player_id = null,
  player_name = null,
  position = null,
  from_team = null,
  to_team = null,
  team_a = null,
  team_a_receives = [],
  team_b = null,
  team_b_receives = [],
  updated_at,
}) {
  return {
    external_id,
    status: 'OFFICIAL',
    move_type,
    is_major_league,
    headline,
    source_name: 'MLB.com Official',
    source_url: 'https://www.mlb.com/transactions',
    reported_at,
    official_date,
    player_id,
    player_name,
    position,
    from_team,
    to_team,
    team_a,
    team_a_receives,
    team_b,
    team_b_receives,
    updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

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

  // Run lightweight cleanup in parallel
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
  let updatedCount = 0;
  let majorLeagueCount = 0;
  let minorLeagueCount = 0;
  const nowIso = new Date().toISOString();

  // Official MLB Stats API Transactions — All 30 MLB Teams (Last 45 Days + 1-day UTC buffer)
  try {
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${fmt(start)}&endDate=${fmt(end)}`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'HotStoveTracker/2.2' },
      }
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
      const desc = decodeHtml(tx.description || '');
      if (isNoiseTransaction(tx, desc)) continue;

      const toMlb = MLB_TEAM_ID_TO_ABBR[tx.toTeam?.id] || null;
      const fromMlb = MLB_TEAM_ID_TO_ABBR[tx.fromTeam?.id] || null;

      if (isTradeTransaction(tx)) {
        const textTeams = detectAllTeamsFromText(desc);
        if (!toMlb && !fromMlb && textTeams.length === 0) continue;
        const tradeDateKey = tx.date || tx.effectiveDate || 'trade';
        const key = tx.tradeId
          ? String(tx.tradeId)
          : `${tradeDateKey}-${stableHash(desc.toLowerCase().replace(/\s+/g, ' ').trim())}`;
        if (!tradeGroups.has(key)) tradeGroups.set(key, []);
        tradeGroups.get(key).push({ ...tx, _desc: desc, _toMlb: toMlb, _fromMlb: fromMlb });
        continue;
      }

      if (!toMlb && !fromMlb) continue;
      singleTx.push({ ...tx, _desc: desc, _toMlb: toMlb, _fromMlb: fromMlb });
    }

    // Sort single moves newest-first
    singleTx.sort((a, b) => {
      const dateA = String(a.date || a.effectiveDate || '');
      const dateB = String(b.date || b.effectiveDate || '');
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return Number(b.id || 0) - Number(a.id || 0);
    });

    // Collect player IDs to hydrate from MLB Stats API (all trades + all non-explicitly-MiLB single moves)
    const idsToHydrate = [];
    for (const items of tradeGroups.values()) {
      for (const leg of items) {
        if (leg.person?.id) idsToHydrate.push(leg.person.id);
      }
    }
    for (const tx of singleTx) {
      if (tx.person?.id && !EXPLICIT_MILB_RE.test(tx._desc)) {
        idsToHydrate.push(tx.person.id);
      }
    }

    const peopleById = await hydratePeopleById(idsToHydrate);

    // Check which trades have ZERO MLB-debuted players so we can verify against official 40-Man rosters
    // (this cleanly distinguishes a 40-man prospect trade from a pure minor-league prospect trade)
    const teamsNeeding40ManCheck = new Set();
    for (const items of tradeGroups.values()) {
      const first = items[0];
      if (EXPLICIT_MILB_RE.test(first._desc)) continue;
      const hasAnyDebut = items.some((leg) => {
        const person = leg.person?.id ? peopleById.get(Number(leg.person.id)) : null;
        return Boolean(person?.mlbDebutDate);
      });
      if (!hasAnyDebut) {
        for (const leg of items) {
          if (leg._toMlb) teamsNeeding40ManCheck.add(leg._toMlb);
          if (leg._fromMlb) teamsNeeding40ManCheck.add(leg._fromMlb);
        }
        for (const abbr of detectAllTeamsFromText(first._desc)) {
          teamsNeeding40ManCheck.add(abbr);
        }
      }
    }

    // Also check 40-man rosters for non-debuted players in ambiguous signings/releases/FA moves
    for (const tx of singleTx) {
      const pid = Number(tx.person?.id);
      if (!pid || EXPLICIT_MILB_RE.test(tx._desc)) continue;
      const code = String(tx.typeCode || '').toUpperCase();
      if (MLB_ROSTER_ACTION_CODES.has(code) || MLB_ROSTER_ACTION_RE.test(tx._desc)) continue;
      const person = peopleById.get(pid);
      if (person && !person.mlbDebutDate) {
        if (tx._toMlb) teamsNeeding40ManCheck.add(tx._toMlb);
        if (tx._fromMlb) teamsNeeding40ManCheck.add(tx._fromMlb);
      }
    }

    const fortyManIds = await fetchFortyManIdsForTeams(Array.from(teamsNeeding40ManCheck));

    const mlbRows = [];
    const milbRows = [];
    const seenExtIds = new Set();
    const todayFallback = new Date().toISOString().slice(0, 10);

    // 1. Build ALL trade rows with strict MLB-vs-MiLB verification
    for (const [key, items] of tradeGroups.entries()) {
      const extId = `mlb-trade-${key}`;
      if (seenExtIds.has(extId)) continue;
      seenExtIds.add(extId);

      const first = items[0];
      const textTeams = detectAllTeamsFromText(first._desc);
      const clubSet = [];
      const addClub = (abbr) => {
        if (abbr && !clubSet.includes(abbr)) clubSet.push(abbr);
      };

      for (const leg of items) {
        addClub(leg._toMlb);
        addClub(leg._fromMlb);
      }
      for (const t of textTeams) addClub(t);

      const teamA = clubSet[0] || 'MLB';
      const teamB = clubSet[1] || clubSet[0] || 'MLB';

      const teamAReceives = [];
      const teamBReceives = [];
      const seenA = new Set();
      const seenB = new Set();

      let hasMlbPlayerInTrade = false;
      let anyHydratedPlayer = false;
      let anyMlbToMlbLeg = false;

      for (const leg of items) {
        if (leg._toMlb && leg._fromMlb) anyMlbToMlbLeg = true;

        const pid = Number(leg.person?.id) || null;
        const person = pid ? peopleById.get(pid) : null;
        if (person) anyHydratedPlayer = true;

        const hasMlbDebut = Boolean(person?.mlbDebutDate);
        const isOn40Man = Boolean(pid && fortyManIds.has(pid));
        if (hasMlbDebut || isOn40Man) {
          hasMlbPlayerInTrade = true;
        }

        // Resolve destination MLB parent club even when MLB attaches a minor-league affiliate as toTeam
        let dest = leg._toMlb || detectTeamFromText(leg.toTeam?.name);
        if (!dest && person?.currentTeam?.id && MLB_TEAM_ID_TO_ABBR[person.currentTeam.id]) {
          dest = MLB_TEAM_ID_TO_ABBR[person.currentTeam.id];
        }
        if (!dest && person?.currentTeam?.parentOrgId && MLB_TEAM_ID_TO_ABBR[person.currentTeam.parentOrgId]) {
          dest = MLB_TEAM_ID_TO_ABBR[person.currentTeam.parentOrgId];
        }
        if (!dest && leg._fromMlb) {
          dest = leg._fromMlb === teamA ? teamB : teamA;
        }
        if (!dest) dest = teamA;

        const playerName = person?.fullName || leg.person?.fullName || 'Cash / PTBNL';
        const dedupeKey = pid ? `id:${pid}` : `name:${playerName.toLowerCase()}`;
        const position =
          person?.primaryPosition?.abbreviation ||
          (pid ? extractPositionFromText(leg._desc) || 'MLB' : 'Asset');

        const entry = {
          playerId: pid,
          playerName,
          position,
          level: !pid ? 'Asset' : hasMlbDebut ? 'MLB' : isOn40Man ? '40-Man' : 'MiLB',
          isProspect: Boolean(pid && !hasMlbDebut),
          statLine: '',
        };

        if (dest === teamA) {
          if (!seenA.has(dedupeKey)) {
            seenA.add(dedupeKey);
            teamAReceives.push(entry);
          }
        } else {
          if (!seenB.has(dedupeKey)) {
            seenB.add(dedupeKey);
            teamBReceives.push(entry);
          }
        }
      }

      const explicitMinorTrade = EXPLICIT_MILB_RE.test(first._desc);
      // A trade is Major League ONLY if it is not explicitly minor-league AND at least one
      // player involved has MLB experience or is on an MLB 40-man roster.
      // (If hydration failed for every player, fall back to whether legs moved between MLB clubs.)
      const isMajorLeagueTrade =
        !explicitMinorTrade &&
        (anyHydratedPlayer ? hasMlbPlayerInTrade : anyMlbToMlbLeg);

      const tradeDate = first.date || first.effectiveDate || todayFallback;
      const row = buildNormalizedRow({
        external_id: extId,
        move_type: 'TRADE',
        is_major_league: isMajorLeagueTrade,
        headline: first._desc || `${teamA} and ${teamB} Complete Trade`,
        reported_at: safeIsoDate(tradeDate),
        official_date: tradeDate,
        to_team: teamA,
        from_team: teamB,
        team_a: teamA,
        team_a_receives: teamAReceives,
        team_b: teamB,
        team_b_receives: teamBReceives,
        updated_at: nowIso,
      });

      if (isMajorLeagueTrade) mlbRows.push(row);
      else milbRows.push(row);
    }

    // 2. Build ALL single-player transaction rows with strict MLB-vs-MiLB classification
    for (const tx of singleTx) {
      const extId = `mlb-tx-${tx.id}`;
      if (seenExtIds.has(extId)) continue;
      seenExtIds.add(extId);

      const pid = Number(tx.person?.id) || null;
      const person = pid ? peopleById.get(pid) : null;
      const playerName = person?.fullName || tx.person?.fullName || 'Unknown Player';
      const toTeam = tx._toMlb;
      const fromTeam = tx._fromMlb;
      const desc = tx._desc || `${tx.toTeam?.name || 'MLB'} transaction involving ${playerName}`;
      const code = String(tx.typeCode || '').toUpperCase();
      const txDate = tx.date || tx.effectiveDate || todayFallback;

      let isMajorLeague = false;
      if (EXPLICIT_MILB_RE.test(desc)) {
        isMajorLeague = false;
      } else if (MLB_ROSTER_ACTION_CODES.has(code) || MLB_ROSTER_ACTION_RE.test(desc)) {
        // Explicit 40-man / MLB roster move (DFA, waiver claim, outright, IL, call-up, option, non-tender, extension)
        isMajorLeague = true;
      } else if (person) {
        const hasMlbDebut = Boolean(person.mlbDebutDate);
        const isOn40Man = Boolean(pid && fortyManIds.has(pid));
        const onMlbCurrentTeam = Boolean(MLB_TEAM_ID_TO_ABBR[person.currentTeam?.id]);
        isMajorLeague = hasMlbDebut || isOn40Man || onMlbCurrentTeam;
      } else {
        // Fallback if player hydration was unavailable
        isMajorLeague = Boolean(toTeam || fromTeam);
      }

      const position =
        person?.primaryPosition?.abbreviation || extractPositionFromText(desc) || null;

      const row = buildNormalizedRow({
        external_id: extId,
        move_type: classifySingleMoveType(tx.typeCode, desc),
        is_major_league: isMajorLeague,
        headline: desc,
        reported_at: safeIsoDate(txDate),
        official_date: txDate,
        player_id: pid,
        player_name: playerName,
        position,
        from_team: fromTeam,
        to_team: toTeam || fromTeam,
        updated_at: nowIso,
      });

      if (isMajorLeague) mlbRows.push(row);
      else milbRows.push(row);
    }

    // Keep 100% of ALL MLB moves (NEVER truncated!) + up to 300 newest MiLB moves
    const rowsToUpsert = [...mlbRows, ...milbRows.slice(0, 300)];
    majorLeagueCount = mlbRows.length;
    minorLeagueCount = Math.min(milbRows.length, 300);

    // 3. Check existing external_ids for accurate new vs refreshed counts
    const existingIds = new Set();
    const allExtIds = rowsToUpsert.map((r) => r.external_id);
    const LOOKUP_CHUNK = 200;
    for (let i = 0; i < allExtIds.length; i += LOOKUP_CHUNK) {
      const slice = allExtIds.slice(i, i + LOOKUP_CHUNK);
      const { data: foundRows } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', slice);
      for (const row of foundRows || []) {
        existingIds.add(row.external_id);
      }
    }

    // 4. Batched upsert in chunks of 150 (updates existing rows so misclassified trades & old dates fix themselves)
    const CHUNK_SIZE = 150;
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
      const { error: upsertErr } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false });

      if (upsertErr) {
        return res.status(500).json({
          error: `Supabase upsert failed: ${upsertErr.message}`,
        });
      }

      for (const r of chunk) {
        if (existingIds.has(r.external_id)) updatedCount++;
        else addedCount++;
      }
    }
  } catch (err) {
    return res.status(500).json({ error: `MLB API sync failed: ${err.message}` });
  }

  const summary =
    addedCount > 0
      ? `Synced official MLB feed: ${addedCount} new ${addedCount === 1 ? 'move' : 'moves'} (${majorLeagueCount} MLB tracked)`
      : `Official MLB feed up to date (${majorLeagueCount} MLB moves verified)`;

  await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_synced_at: nowIso, last_sync_summary: summary });

  return res.status(200).json({
    skipped: false,
    addedCount,
    updatedCount,
    majorLeagueCount,
    minorLeagueCount,
    upgradedCount: 0,
    last_synced_at: nowIso,
    summary,
  });
}
