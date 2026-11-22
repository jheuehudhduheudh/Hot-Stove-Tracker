import { createClient } from '@supabase/supabase-js';

const TEAM_MAP = {
  angels: 'LAA', diamondbacks: 'ARI', orioles: 'BAL', 'red sox': 'BOS',
  cubs: 'CHC', reds: 'CIN', guardians: 'CLE', rockies: 'COL',
  tigers: 'DET', astros: 'HOU', royals: 'KC', dodgers: 'LAD',
  nationals: 'WSH', mets: 'NYM', athletics: 'ATH', pirates: 'PIT',
  padres: 'SD', mariners: 'SEA', giants: 'SF', cardinals: 'STL',
  rays: 'TB', rangers: 'TEX', 'blue jays': 'TOR', twins: 'MIN',
  phillies: 'PHI', braves: 'ATL', 'white sox': 'CWS', marlins: 'MIA',
  yankees: 'NYY', brewers: 'MIL'
};

function detectTeam(text) {
  const lower = (text || '').toLowerCase();
  for (const [name, abbr] of Object.entries(TEAM_MAP)) {
    if (lower.includes(name)) return abbr;
  }
  return null;
}

function parseContractRegex(text) {
  const yearsMatch = text.match(/(\d+)[-\s]year/i);
  const moneyMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(M|million|B|billion)/i);
  const years = yearsMatch ? parseInt(yearsMatch[1], 10) : null;
  let totalMillions = null;
  if (moneyMatch) {
    const num = parseFloat(moneyMatch[1]);
    const unit = moneyMatch[2].toLowerCase();
    totalMillions = unit.startsWith('b') ? num * 1000 : num;
  }
  const aav = years && totalMillions ? Number((totalMillions / years).toFixed(2)) : null;
  return { years, totalMillions, aav };
}

async function lookupPlayerId(playerName) {
  if (!playerName) return null;
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}`
    );
    const data = await res.json();
    const person = data?.people?.[0];
    return person
      ? { id: person.id, position: person.primaryPosition?.abbreviation || 'MLB' }
      : null;
  } catch {
    return null;
  }
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, 30)) {
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
    const categories = [...block.matchAll(/<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
      .map((m) => m[1].trim().toLowerCase());

    const isTransaction =
      categories.some((c) => ['signings', 'trades', 'extensions', 'transactions', 'designations', 'waivers'].includes(c)) ||
      /(agree|sign|acquire|trade|extend|designate|claim)/i.test(title);

    if (!isTransaction || !title) continue;

    const isMinorLeague = /minor league/i.test(title);
    const moveType = categories.includes('trades') || /acquire|trade/i.test(title)
      ? 'TRADE'
      : categories.includes('extensions') || /extend/i.test(title)
      ? 'EXTENSION'
      : /designate|waiver|claim/i.test(title)
      ? 'DFA_WAIVER'
      : 'SIGNING';

    const team = detectTeam(title);
    const { years, totalMillions, aav } = parseContractRegex(title);

    let playerName = null;
    const agreeMatch = title.match(/^[A-Za-z\s]+,\s+([A-Z][a-zA-Z.'-]+\s+[A-Z][a-zA-Z.'-]+(?:\s+Jr\.|\s+Sr\.|\s+III)?)\s+Agree/i);
    const signMatch = title.match(/(?:Sign|Acquire|Extend|Designate|Claim)\s+([A-Z][a-zA-Z.'-]+\s+[A-Z][a-zA-Z.'-]+(?:\s+Jr\.|\s+Sr\.|\s+III)?)/i);
    if (agreeMatch) playerName = agreeMatch[1].trim();
    else if (signMatch) playerName = signMatch[1].trim();

    items.push({
      external_id: `mlbtr-${Buffer.from(link || title).toString('base64').slice(0, 48)}`,
      headline: title,
      source_name: 'MLB Trade Rumors',
      source_url: link || 'https://www.mlbtraderumors.com',
      reported_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      move_type: moveType,
      is_major_league: !isMinorLeague,
      to_team: team,
      player_name: playerName,
      contract_years: years,
      total_value_millions: totalMillions,
      aav_millions: aav,
    });
  }
  return items;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const force = req.query?.force === 'true' || req.body?.force === true;

  // 1. Check 5-minute cooldown
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

  let addedCount = 0;
  let upgradedCount = 0;

  // 2. Fetch & Parse MLB Trade Rumors RSS (Stage 1: REPORTED)
  try {
    const rssRes = await fetch('https://www.mlbtraderumors.com/feed', {
      headers: { 'User-Agent': 'HotStoveTracker/1.1' },
    });
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const parsedRumors = parseRssItems(xml);

      for (const item of parsedRumors) {
        const { data: existing } = await supabase
          .from('transactions')
          .select('id')
          .eq('external_id', item.external_id)
          .maybeSingle();

        if (!existing) {
          const person = await lookupPlayerId(item.player_name);
          const { error: insertErr } = await supabase.from('transactions').insert({
            ...item,
            status: 'REPORTED',
            player_id: person?.id || null,
            position: person?.position || null,
          });
          if (!insertErr) addedCount++;
        }
      }
    }
  } catch (err) {
    console.error('RSS sync warning:', err.message);
  }

  // 3. Fetch Official MLB Stats API Transactions (last 14 days, Stage 2: OFFICIAL)
  try {
    const end = new Date();
    const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?startDate=${fmt(start)}&endDate=${fmt(end)}`
    );
    if (mlbRes.ok) {
      const mlbData = await mlbRes.json();
      const rawTx = mlbData?.transactions || [];

      const tradeGroups = new Map();
      const singleTx = [];

      for (const tx of rawTx) {
        if (tx.typeCode === 'TR') {
          const key = tx.tradeId || `${tx.date}-${tx.description}`;
          if (!tradeGroups.has(key)) tradeGroups.set(key, []);
          tradeGroups.get(key).push(tx);
        } else if (['SFA', 'SGN', 'ASG', 'CLW', 'DFA', 'OPT', 'REL', 'NUM'].includes(tx.typeCode)) {
          singleTx.push(tx);
        }
      }

      for (const tx of singleTx.slice(-80)) {
        const extId = `mlb-tx-${tx.id}`;
        const playerName = tx.person?.fullName || 'Unknown Player';
        const toTeam = detectTeam(tx.toTeam?.name || '');
        const fromTeam = detectTeam(tx.fromTeam?.name || '');
        const desc = tx.description || `${tx.toTeam?.name || 'MLB'} transaction involving ${playerName}`;
        const isMinor = /minor league/i.test(desc);
        const moveType = ['DFA', 'CLW', 'REL', 'NUM'].includes(tx.typeCode) ? 'DFA_WAIVER' : 'SIGNING';

        if (toTeam && playerName) {
          const { data: matchingReported } = await supabase
            .from('transactions')
            .select('*')
            .eq('status', 'REPORTED')
            .eq('to_team', toTeam)
            .ilike('player_name', `%${playerName}%`)
            .maybeSingle();

          if (matchingReported) {
            await supabase
              .from('transactions')
              .update({
                status: 'OFFICIAL',
                official_date: tx.date || fmt(end),
                player_id: tx.person?.id || matchingReported.player_id,
                source_name: 'MLB.com Official (Confirmed)',
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchingReported.id);
            upgradedCount++;
            continue;
          }
        }

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
            reported_at: tx.date ? new Date(tx.date).toISOString() : new Date().toISOString(),
            official_date: tx.date || fmt(end),
            player_id: tx.person?.id || null,
            player_name: playerName,
            from_team: fromTeam,
            to_team: toTeam,
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
        const teamA = detectTeam(first.toTeam?.name || '') || 'TEAM A';
        const teamB = detectTeam(first.fromTeam?.name || '') || 'TEAM B';

        const teamAReceives = [];
        const teamBReceives = [];
        let hasMlbPlayer = false;

        for (const leg of items) {
          const dest = detectTeam(leg.toTeam?.name || '');
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
          headline: first.description || `${teamA} and ${teamB} Complete Trade`,
          source_name: 'MLB.com Official',
          source_url: 'https://www.mlb.com/transactions',
          reported_at: first.date ? new Date(first.date).toISOString() : new Date().toISOString(),
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
  const summary = `Added ${addedCount} new, upgraded ${upgradedCount} to Official`;
  await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_synced_at: nowIso, last_sync_summary: summary });

  return res.status(200).json({
    skipped: false,
    addedCount,
    upgradedCount,
    last_synced_at: nowIso,
    summary,
  });
}
