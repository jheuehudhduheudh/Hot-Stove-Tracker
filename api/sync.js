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

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

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

function parseContractDetails(title, description = '') {
  const combined = `${title} ${description}`;
  let years = null;

  const digitYears = combined.match(/(\d+)[-\s]year/i);
  if (digitYears) {
    years = parseInt(digitYears[1], 10);
  } else {
    const wordYears = combined.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[-\s]year\b/i);
    if (wordYears) years = WORD_NUMBERS[wordYears[1].toLowerCase()] || null;
  }

  let totalMillions = null;
  const moneyMatch = combined.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)[\s-]*(MM|M|million|B|billion|K|thousand)?\b/i);
  if (moneyMatch) {
    const rawNum = parseFloat(moneyMatch[1].replace(/,/g, ''));
    const unit = (moneyMatch[2] || '').toLowerCase();
    if (unit === 'b' || unit === 'billion') {
      totalMillions = Number((rawNum * 1000).toFixed(2));
    } else if (unit === 'mm' || unit === 'm' || unit === 'million') {
      totalMillions = Number(rawNum.toFixed(2));
    } else if (unit === 'k' || unit === 'thousand') {
      totalMillions = Number((rawNum / 1000).toFixed(3));
    } else if (rawNum >= 500000) {
      totalMillions = Number((rawNum / 1000000).toFixed(2));
    }
  }

  if (years && (years < 1 || years > 15)) years = null;
  if (totalMillions && (totalMillions < 0.5 || totalMillions > 1500)) totalMillions = null;

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

  const speculationPattern = /(had\s+interest|have\s+interest|expressed\s+interest|receiving\s+.*interest|drawing\s+.*interest|trade\s+interest|trade\s+deadline|listening\s+to|could\s+|might\s+|rumors|mailbag|live\s+chat|poll|predictions|candidates|top\s+\d+|podcast|notes:|open\s+to|pursuing|eyeing|targeting|linked\s+to|meeting\s+with|unlikely\s+to|expected\s+to\s+shop|shopping\s+|offseason\s+outlook|arbitration\s+projections|predicted\s+salaries|free\s+agent\s+profile|contract\s+prediction)/i;

  const actionPattern = /\b(sign|signs|signed|re-sign|re-signs|re-signed|agree|agrees|agreed|acquire|acquires|acquired|trade|trades|traded|extend|extends|extended|extension|designate|designates|designated|dfa|claim|claims|claimed|release|releases|released|non-tender|non-tenders|non-tendered|exercise|exercises|exercised|decline|declines|declined|accept|accepts|accepted|qualifying\s+offer|outright|outrighted|recall|recalled|option|optioned|injured\s+list)\b/i;

  for (const block of itemBlocks.slice(0, 45)) {
    const rawTitle =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
      '';
    const rawDesc =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ||
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ||
      '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();

    const title = decodeHtml(rawTitle);
    const description = decodeHtml(rawDesc);

    if (!title) continue;
    if (speculationPattern.test(title)) continue;
    if (!actionPattern.test(title)) continue;

    const team = detectTeamFromText(title);
    if (!team) continue;

    const isMinorLeague = /minor league/i.test(title) || /minor league deal/i.test(description);

    let moveType = 'SIGNING';
    if (/\b(acquire|acquires|acquired|trade|trades|traded)\b/i.test(title)) {
      moveType = 'TRADE';
    } else if (/\b(extend|extends|extended|extension)\b/i.test(title)) {
      moveType = 'EXTENSION';
    } else if (/\b(designate|designates|designated|dfa|claim|claims|claimed|release|releases|released|non-tender|non-tenders|non-tendered|outright|outrighted|decline|declines|declined|recall|recalled|option|optioned|injured\s+list)\b/i.test(title)) {
      moveType = 'DFA_WAIVER';
    }

    const { years, totalMillions, aav } = parseContractDetails(title, description);

    let playerName = null;
    const agreeMatch = title.match(/^[A-Za-z\s.'-]+,\s+([A-Z][a-zA-Z.'-]+\s+[A-Z][a-zA-Z.'-]+(?:\s+Jr\.|\s+Sr\.|\s+III)?)\s+Agree/i);
    const verbMatch = title.match(/\b(?:Sign|Signs|Re-Sign|Re-Signs|Acquire|Acquires|Extend|Extends|Designate|Designates|Claim|Claims|Release|Releases|Non-Tender|Non-Tenders|Exercise|Decline|Recall|Option)\s+([A-Z][a-zA-Z.'-]+\s+[A-Z][a-zA-Z.'-]+(?:\s+Jr\.|\s+Sr\.|\s+III)?)/);
    if (agreeMatch) playerName = agreeMatch[1].trim();
    else if (verbMatch) playerName = verbMatch[1].trim();

    if (playerName && /^(To |A |An |The |Club |Mutual |Player |Two |Three |Four |Five |Minor |Major )/i.test(playerName)) {
      playerName = null;
    }

    const notesSnippet = description.length > 140 ? `${description.slice(0, 140)}...` : description;

    items.push({
      external_id: `mlbtr-${Buffer.from(link || title).toString('base64').slice(0, 48)}`,
      headline: title,
      source_name: 'MLB Trade Rumors',
      source_url: link || 'https://www.mlbtraderumors.com',
      reported_at: safeIsoDate(pubDate),
      move_type: moveType,
      is_major_league: !isMinorLeague,
      to_team: team,
      player_name: playerName,
      contract_years: years,
      total_value_millions: totalMillions,
      aav_millions: aav,
      contract_notes: notesSnippet,
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

  try {
    await supabase.from('transactions').delete().is('to_team', null).is('from_team', null).is('team_a', null);
    await supabase.from('transactions').delete().ilike('headline', '%assigned to%');
    await supabase.from('transactions').delete().ilike('headline', '%&#%');
    await supabase.from('transactions').delete().ilike('headline', '%Receiving Trade Interest%');
    await supabase.from('transactions').delete().ilike('headline', '%Had Interest In%');
    await supabase.from('transactions').delete().ilike('headline', '%At Trade Deadline%');
    await supabase.from('transactions').delete().ilike('headline', '%Offseason Outlook%');
  } catch (cleanErr) {
    console.error('Cleanup warning:', cleanErr.message);
  }

  let addedCount = 0;
  let upgradedCount = 0;

  const rssFeeds = [
    'https://www.mlbtraderumors.com/feed',
    'https://www.mlbtraderumors.com/category/transactions/feed',
  ];
  const seenExtIds = new Set();

  for (const feedUrl of rssFeeds) {
    try {
      const rssRes = await fetch(feedUrl, {
        headers: { 'User-Agent': 'HotStoveTracker/1.4' },
      });
      if (!rssRes.ok) continue;
      const xml = await rssRes.text();
      const parsedRumors = parseRssItems(xml);

      for (const item of parsedRumors) {
        if (seenExtIds.has(item.external_id)) continue;
        seenExtIds.add(item.external_id);

        const { data: existing } = await supabase
          .from('transactions')
          .select('id, contract_years, total_value_millions')
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
        } else if (!existing.total_value_millions && item.total_value_millions) {
          await supabase
            .from('transactions')
            .update({
              contract_years: item.contract_years,
              total_value_millions: item.total_value_millions,
              aav_millions: item.aav_millions,
              contract_notes: item.contract_notes,
            })
            .eq('id', existing.id);
        }
      }
    } catch (err) {
      console.error('RSS sync warning:', err.message);
    }
  }

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

      for (const tx of singleTx.slice(-110)) {
        const extId = `mlb-tx-${tx.id}`;
        const playerName = tx.person?.fullName || 'Unknown Player';
        const toTeam = tx._toMlb;
        const fromTeam = tx._fromMlb;
        const desc = decodeHtml(tx.description || `${tx.toTeam?.name || 'MLB'} transaction involving ${playerName}`);
        const isMinor = /minor league/i.test(desc);
        const moveType = ['DFA', 'CLW', 'REL', 'OUT', 'IL', 'CU', 'OPT', 'REC'].includes(tx.typeCode) ? 'DFA_WAIVER' : 'SIGNING';

        if (toTeam && playerName && playerName !== 'Unknown Player') {
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
  const summary = `Synced MLB feed: ${addedCount} new moves, ${upgradedCount} upgraded to Official`;
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
