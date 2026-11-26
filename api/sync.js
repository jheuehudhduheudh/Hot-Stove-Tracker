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
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

const SPECULATION_RUMOR_RE =
  /(\?|receiving\s+.*interest|drawing\s+.*interest|trade\s+interest|listening\s+to|could\s+|might\s+|should\s+|will\s+sign|predicted\s+to|expected\s+to|looking\s+to|hopeful\s+to|trying\s+to|interested\s+in|willing\s+to|rumors|mailbag|live\s+chat|poll|predictions|projections|offseason\s+outlook|stock\s+watch|rankings|candidates|top\s+\d+|podcast|notes:|the\s+opener:|open\s+to|pursuing|eyeing|targeting|linked\s+to|meeting\s+with|unlikely\s+to|shopping\s+|international\s+amateur|draft\s+pick|(?:sign|signs|signed|agree|agrees|agreed)\s+(?:with|in)\s+(?:npb|kbo|japan|korea)|mexican\s+league|independent\s+league|in\s+agreement\s+with\s+.*on\s+coaching|hires\s+|hire\s+|manager\s+|coach|front\s+office|general\s+manager|best\s+fits\s+for|chat\s+transcript)/i;

const DEAL_ACTION_RE =
  /\b(sign|signs|signed|re-sign|re-signs|re-signed|agree|agrees|agreed|extend|extends|extended|extension|avoids?\s+arbitration)\b/i;

function normalizePersonKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

const NON_DEAL_SENTENCE_RE =
  /\b(luxury\s+tax|cbt\s+threshold|competitive\s+balance\s+tax|qualifying\s+offer|mlbtr\s+predicted|mlbtr\s+projected|we\s+predicted|we\s+projected|our\s+prediction|predicted\s+a|projected\s+a|projected\s+to\s+earn|arbitration\s+projection|coming\s+off\s+a|previously\s+signed|previous\s+contract|prior\s+contract|previous\s+deal|prior\s+deal|last\s+contract|previously\s+earned|earned\s+\$|made\s+\$|owed\s+\$|final\s+year\s+of|compared\s+to|surpasses|behind\s+only|falls\s+short\s+of|similar\s+to|eclipses|signing\s+bonus\s+pool)\b/i;

const EXCLUDED_MONEY_BEFORE_RE =
  /\b(signing\s+bonus(?:\s+of)?|bonus(?:\s+of)?|buyout(?:\s+of)?|(?:club|mutual|player|vesting)\s+option(?:\s+of|\s+worth|\s+for)?|option\s+(?:of|worth|for)|incentives?\s+(?:of|up\s+to)|escalators?\s+(?:of|up\s+to)|deferrals?\s+of|deferred\s+(?:money\s+of)?|even\s+salaries\s+of|annual\s+salar(?:y|ies)\s+of|base\s+salar(?:y|ies)\s+of|salaries\s+of|salary\s+of|avoids?\s+tax|up\s+to|could\s+reach|can\s+reach|max(?:imum)?\s+(?:value\s+of|of)|worth\s+up\s+to|projected\s+(?:at|for|to\s+earn)|predicted\s+(?:at|for)|earned|made|owed)\s*$/i;

const EXCLUDED_MONEY_AFTER_RE =
  /^\s*(?:signing\s+bonus|bonus|buyout|(?:club|mutual|player|vesting)\s+option|option\b|per\s+year|per\s+season|annually|a\s+year|each\s+year|each\s+season|in\s+each\s+year|in\s+each\s+season|aav\b|average\s+annual|in\s+incentives|in\s+escalators|in\s+performance\s+bonuses|deferred|in\s+deferrals|qualifying\s+offer|in\s+20\d\d\b)/i;

const NON_CONTRACT_YEAR_AFTER_RE =
  /^\s*(?:old\b|veteran|vet\b|option|club\s+option|mutual\s+option|player\s+option|vesting\s+option|stretch|span|run\b|hiatus|absence|stint|tenure|career|window|history|wait)/i;

function parseYearToken(tok) {
  if (!tok) return null;
  const lower = String(tok).trim().toLowerCase();
  const n = /^\d+$/.test(lower) ? parseInt(lower, 10) : WORD_NUMBERS[lower] || null;
  return n && n >= 1 && n <= 15 ? n : null;
}

function parseMoneyTokenToMillions(numStr, unitStr) {
  if (!numStr) return null;
  const rawNum = parseFloat(String(numStr).replace(/,/g, ''));
  if (!Number.isFinite(rawNum) || rawNum <= 0) return null;
  const unit = String(unitStr || '').trim().toLowerCase();
  let totalMillions = null;
  if (unit === 'b' || unit === 'billion') {
    totalMillions = Number((rawNum * 1000).toFixed(2));
  } else if (unit === 'mm' || unit === 'm' || unit === 'million') {
    totalMillions = Number(rawNum.toFixed(2));
  } else if (unit === 'k' || unit === 'thousand') {
    totalMillions = Number((rawNum / 1000).toFixed(3));
  } else if (rawNum >= 500000) {
    totalMillions = Number((rawNum / 1000000).toFixed(2));
  }
  if (totalMillions && (totalMillions < 0.25 || totalMillions > 2000)) return null;
  return totalMillions;
}

function splitIntoSentences(text) {
  const normalized = String(text || '')
    .replace(/\b(\d{1,2}:\d{2}\s*(?:am|pm)\s*:)/gi, '\n$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/(?:(?<=[.!?])\s+(?=[A-Z0-9"“])|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isExcludedMoneyContext(text, startIdx, endIdx) {
  const beforeFull = text.slice(Math.max(0, startIdx - 50), startIdx);
  const afterFull = text.slice(endIdx, Math.min(text.length, endIdx + 50));
  // Bound context check to the immediate clause (stop at sentence/semicolon boundary)
  const before = beforeFull.split(/[.;!?]/).pop() || '';
  const after = afterFull.split(/[.;!?]/)[0] || '';
  if (EXCLUDED_MONEY_BEFORE_RE.test(before)) return true;
  if (EXCLUDED_MONEY_AFTER_RE.test(after)) return true;
  return false;
}

function extractCleanYearsFromText(text) {
  const s = String(text || '');
  const re =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[-\s](?:year|yr)s?\b/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 28);
    if (NON_CONTRACT_YEAR_AFTER_RE.test(after)) continue;
    const before = s.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(previous|prior|old|former|club|mutual|player|vesting)\s*$/i.test(before)) continue;
    const y = parseYearToken(m[1]);
    if (y) return y;
  }
  return null;
}

function extractPairedDealFromText(text) {
  const s = String(text || '');

  // Pattern A: "five-year, $125MM" / "5-year deal worth $125 million" / "5-yr/$125M"
  const patA =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[-\s](?:year|yr)s?(?:\s*,\s*|\s*\/\s*|\s+(?:major\s+league\s+)?(?:contract|deal|extension|agreement|guarantee)\s+(?:worth\s+|for\s+|valued\s+at\s+|of\s+|guaranteed\s+at\s+|at\s+)?|\s+(?:worth|for)\s+)\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|B|billion|K|thousand)?\b/gi;
  let m;
  while ((m = patA.exec(s)) !== null) {
    const before = s.slice(Math.max(0, m.index - 35), m.index);
    if (/\b(option|buyout|previous|prior|old|former|predicted|projected|coming\s+off)\b/i.test(before)) {
      continue;
    }
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 35);
    if (/^\s*(?:club\s+option|mutual\s+option|player\s+option|vesting\s+option|option\b|buyout\b)/i.test(after)) {
      continue;
    }
    const years = parseYearToken(m[1]);
    const totalMillions = parseMoneyTokenToMillions(m[2], m[3]);
    if (years && totalMillions) {
      return { years, totalMillions };
    }
  }

  // Pattern B: "$125MM over five years" / "$125 million contract over 5 years"
  const patB =
    /\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|B|billion|K|thousand)?\s+(?:(?:guaranteed\s+)?(?:contract|deal|extension|guarantee)\s+)?(?:over|for)\s+(?:the\s+next\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[-\s](?:year|yr|season)s?\b/gi;
  while ((m = patB.exec(s)) !== null) {
    if (isExcludedMoneyContext(s, m.index, m.index + m[0].length)) continue;
    const totalMillions = parseMoneyTokenToMillions(m[1], m[2]);
    const years = parseYearToken(m[3]);
    if (years && totalMillions) {
      return { years, totalMillions };
    }
  }

  return null;
}

function extractExplicitGuaranteeFromText(text) {
  const s = String(text || '');
  const patterns = [
    /\b(?:total\s+guarantee\s+of|guarantee\s+of|guaranteed\s+(?:at\s+)?|contract\s+worth|deal\s+worth|extension\s+worth|worth|valued\s+at)\s+\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|B|billion|K|thousand)?\b/gi,
    /\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|B|billion|K|thousand)?\s+(?:total\s+)?(?:guarantee|guaranteed|contract|deal|extension)\b/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(s)) !== null) {
      const dollarIdx = m[0].indexOf('$');
      const absStart = m.index + Math.max(0, dollarIdx);
      const absEnd = m.index + m[0].length;
      if (isExcludedMoneyContext(s, absStart, absEnd)) continue;
      const val = parseMoneyTokenToMillions(m[1], m[2]);
      if (val) return val;
    }
  }
  return null;
}

function extractBonusPlusAnnualBreakdown(text, knownYears) {
  if (!knownYears || knownYears < 2) return null;
  const s = String(text || '');

  // Match signing bonus: "$10MM signing bonus" or "signing bonus of $10MM"
  let bonusMillions = 0;
  const bonusBefore = s.match(
    /\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|K|thousand)?\s+signing\s+bonus\b/i
  );
  const bonusAfter = s.match(
    /\bsigning\s+bonus\s+of\s+\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|K|thousand)?\b/i
  );
  const bonusMatch = bonusBefore || bonusAfter;
  if (bonusMatch) {
    bonusMillions = parseMoneyTokenToMillions(bonusMatch[1], bonusMatch[2]) || 0;
  }

  // Match uniform annual salary: "even salaries of $23MM in each year" / "$23MM per year" / "$23MM annually"
  const annualPatterns = [
    /\b(?:even\s+salaries\s+of|annual\s+salar(?:y|ies)\s+of|base\s+salar(?:y|ies)\s+of|salaries\s+of)\s+\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|K|thousand)?\s*(?:per\s+year|per\s+season|annually|in\s+each\s+(?:year|season)|each\s+(?:year|season))?\b/i,
    /\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|K|thousand)?\s+(?:per\s+year|per\s+season|annually|in\s+each\s+(?:year|season)|each\s+(?:year|season))\b/i,
  ];
  let annualMillions = null;
  for (const re of annualPatterns) {
    const am = s.match(re);
    if (am) {
      annualMillions = parseMoneyTokenToMillions(am[1], am[2]);
      if (annualMillions) break;
    }
  }

  if (!annualMillions) return null;
  const computedTotal = Number((bonusMillions + annualMillions * knownYears).toFixed(2));
  if (computedTotal < 0.5 || computedTotal > 2000) return null;
  return computedTotal;
}

function extractCleanStandaloneMoney(text) {
  const s = String(text || '');
  const re = /\$(\d+(?:,\d{3})*(?:\.\d+)?)[-\s]*(MM|M|million|B|billion|K|thousand)?\b/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (isExcludedMoneyContext(s, m.index, m.index + m[0].length)) continue;
    const val = parseMoneyTokenToMillions(m[1], m[2]);
    if (val) return val;
  }
  return null;
}

function pickBestContractNote(title, description, bodyText) {
  const sentences = splitIntoSentences(bodyText.slice(0, 4500));
  const cleanSentences = sentences
    .map((s) => s.replace(/^\d{1,2}:\d{2}\s*(?:am|pm)\s*:\s*/i, '').trim())
    .filter((s) => s.length >= 25 && !NON_DEAL_SENTENCE_RE.test(s));

  // Prefer the sentence that states the paired contract terms (e.g. "five-year, $125MM")
  const pairedSentence = cleanSentences.find((s) => Boolean(extractPairedDealFromText(s)));
  if (pairedSentence) {
    return pairedSentence.length > 180
      ? `${pairedSentence.slice(0, 180).trim()}...`
      : pairedSentence;
  }

  const fallback = String(description || bodyText || '')
    .replace(/^\d{1,2}:\d{2}\s*(?:am|pm)\s*:\s*/i, '')
    .trim();
  if (!fallback) return null;
  return fallback.length > 180 ? `${fallback.slice(0, 180).trim()}...` : fallback;
}

function parseContractDetails(title, bodyText = '') {
  const cleanTitle = String(title || '');
  // Search up to 4,500 chars so MLBTR reverse-chronological timestamped updates don't push the
  // original "five-year, $125MM deal" paragraph out of view.
  const sentences = splitIntoSentences(String(bodyText || '').slice(0, 4500));
  const cleanSentences = sentences.filter((s) => !NON_DEAL_SENTENCE_RE.test(s));
  const cleanBody = cleanSentences.join(' ');

  // Tier 4 (Highest confidence): Paired "X-year, $YM" directly in headline
  const titlePaired = extractPairedDealFromText(cleanTitle);
  if (titlePaired) {
    const { years, totalMillions } = titlePaired;
    return {
      years,
      totalMillions,
      aav: Number((totalMillions / years).toFixed(2)),
      confidence: 4,
    };
  }

  // Tier 3 (High confidence): Paired "X-year, $YM" in a clean article sentence
  for (const sentence of cleanSentences) {
    const bodyPaired = extractPairedDealFromText(sentence);
    if (bodyPaired) {
      const { years, totalMillions } = bodyPaired;
      return {
        years,
        totalMillions,
        aav: Number((totalMillions / years).toFixed(2)),
        confidence: 3,
      };
    }
  }

  // Extract clean years from headline or clean sentences
  const years = extractCleanYearsFromText(cleanTitle) ?? extractCleanYearsFromText(cleanBody);

  // Tier 2A (Medium-High): Explicit total guarantee phrase ("$125MM guarantee", "worth $125MM")
  const explicitGuarantee =
    extractExplicitGuaranteeFromText(cleanTitle) ?? extractExplicitGuaranteeFromText(cleanBody);
  if (explicitGuarantee) {
    // Reject obvious signing-bonus/option mistakes on multi-year deals if a bonus+annual breakdown exists
    const breakdownTotal = extractBonusPlusAnnualBreakdown(cleanBody, years);
    if (breakdownTotal && years >= 2 && explicitGuarantee < breakdownTotal * 0.6) {
      return {
        years,
        totalMillions: breakdownTotal,
        aav: Number((breakdownTotal / years).toFixed(2)),
        confidence: 2,
      };
    }
    return {
      years,
      totalMillions: explicitGuarantee,
      aav: years ? Number((explicitGuarantee / years).toFixed(2)) : null,
      confidence: 2,
    };
  }

  // Tier 2B (Medium-High): Compute exact total from signing bonus + uniform annual salaries
  // e.g. "$10MM signing bonus and even salaries of $23MM in each year" over 5 years = $125M
  const breakdownTotal = extractBonusPlusAnnualBreakdown(cleanBody, years);
  if (breakdownTotal) {
    return {
      years,
      totalMillions: breakdownTotal,
      aav: Number((breakdownTotal / years).toFixed(2)),
      confidence: 2,
    };
  }

  // Tier 1 (Fallback): Clean standalone dollar amount (not signing bonus, option, buyout, per-year, etc.)
  const leadClean = cleanSentences.slice(0, 4).join(' ');
  let standaloneMoney =
    extractCleanStandaloneMoney(cleanTitle) ?? extractCleanStandaloneMoney(leadClean);

  // Sanity guard: multi-year MLB deals don't average under $1.25M/yr (prevents stray small bonuses/fees)
  if (years && years >= 2 && standaloneMoney && standaloneMoney / years < 1.25) {
    standaloneMoney = null;
  }

  return {
    years,
    totalMillions: standaloneMoney,
    aav: years && standaloneMoney ? Number((standaloneMoney / years).toFixed(2)) : null,
    confidence: standaloneMoney ? 1 : 0,
  };
}

const INVALID_PLAYER_CANDIDATE_RE =
  /^(To|A|An|The|Club|Mutual|Player|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Minor|Major|Contract|Free|Agent|Agents|Left|Right|Lefty|Righty|Southpaw|Ace|Closer|Setup|Swingman|Hurler|Backstop|Corner|First|Second|Third|Center|Designated|Former|Ex|Superstar|Phenom|Rookie|Reliever|Starter|Pitcher|Catcher|Infielder|Outfielder|Shortstop|Utility|Veteran|Slugger|Star|Japanese|Korean|All|New|York|Los|Angeles|San|Diego|Francisco|St|Louis|Tampa|Bay|Kansas|City|Chicago|White|Red|Blue|Jays|Sox|Mets|Yankees|Dodgers|Cubs|Braves|Astros|Phillies|Padres|Mariners|Rangers|Orioles|Twins|Guardians|Tigers|Royals|Angels|Athletics|Diamondbacks|Rockies|Giants|Cardinals|Pirates|Reds|Brewers|Marlins|Nationals|Rays|Report|Reports|Sources|Source|Deal|Terms|Year|Million|Pending|Agreement|Agree|Agreed|Signs|Signed|Re-Signs|Re-Signed)\b/i;

const NAME_PARTICLE_WORDS = new Set(['de', 'da', 'del', 'della', 'di', 'la', 'le', 'van', 'von', 'st', 'st.', 'mc', 'mac']);

function cleanCandidateName(raw) {
  let name = String(raw || '')
    .replace(/\s+(?:To|With|On|For|In|At|Per|Report|Reports|Sources|Ahead|Pending)\b.*$/i, '')
    .replace(/[,:;]+$/, '')
    .trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  // First and last words of a real player name must start with an uppercase letter
  // (blocks lowercase descriptors like "righty Gausman" or "lefty Peterson" captured by /i regexes)
  if (!/^[A-ZÀ-ÖØ-Þ]/.test(words[0])) return null;
  if (!/^[A-ZÀ-ÖØ-Þ]/.test(words[words.length - 1])) return null;
  for (let i = 1; i < words.length - 1; i++) {
    if (!/^[A-ZÀ-ÖØ-Þ]/.test(words[i]) && !NAME_PARTICLE_WORDS.has(words[i].toLowerCase())) {
      return null;
    }
  }
  if (INVALID_PLAYER_CANDIDATE_RE.test(name)) return null;
  if (detectTeamFromText(name)) return null;
  return name;
}

// Uses native JS regex literals (never string-escaped RegExp) with full accented-letter support
function extractReportedPlayerName(title) {
  const cleaned = String(title || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern 1: "Mets, Tarik Skubal Agree To ..." / "Guardians, Kris Bubic Agree To ..."
  const commaMatch = cleaned.match(
    /^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+,\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+){1,2}(?:\s+(?:Jr\.|Sr\.|III|II))?)\s+(?:Agrees?|Agreed|Signs?|Signed|Re-Signs?|Re-Signed|Extends?|Extended|Set\s+To\s+Sign|In\s+Agreement|Avoids?)/i
  );
  if (commaMatch) {
    const c = cleanCandidateName(commaMatch[1]);
    if (c) return c;
  }

  // Pattern 2: "Orioles Sign Freddy Peralta" / "Mets To Sign Tarik Skubal" / "Tigers Sign Ha-Seong Kim"
  const afterVerbMatch = cleaned.match(
    /\b(?:To\s+Sign|To\s+Re-Sign|To\s+Extend|Sign|Signs|Signed|Re-Sign|Re-Signs|Re-Signed|Extend|Extends|Extended)\s+(?:Free\s+Agent\s+)?(?:(?:Star|Veteran|All-Star|Japanese|Korean|NPB|KBO|Former\s+[A-Za-z]+)\s+){0,2}(?:(?:RHP|LHP|SP|RP|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|INF|UTL|Right-Hander|Left-Hander|Righty|Lefty|Southpaw|Closer|Ace|Backstop|Hurler|Pitcher|Reliever|Starter|Slugger|Infielder|Outfielder|Catcher|Shortstop)\s+){0,2}([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+(?:de|da|del|la|le|van|von|[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+)){1,2}(?:\s+(?:Jr\.|Sr\.|III|II))?)/i
  );
  if (afterVerbMatch) {
    const c = cleanCandidateName(afterVerbMatch[1]);
    if (c) return c;
  }

  // Pattern 3: "Blue Jays Agree To 5-Year, $80M Deal With Kaima Taira" / "...deal with lefty David Peterson"
  const withPlayerMatch = cleaned.match(
    /\b(?:Deal|Contract|Extension|Agreement|Terms)\s+With\s+(?:Free\s+Agent\s+)?(?:(?:Star|Veteran|All-Star|Japanese|Korean|NPB|KBO|Former\s+[A-Za-z]+)\s+){0,2}(?:(?:RHP|LHP|SP|RP|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|INF|UTL|Right-Hander|Left-Hander|Righty|Lefty|Southpaw|Closer|Ace|Backstop|Hurler|Pitcher|Reliever|Starter|Slugger|Infielder|Outfielder|Catcher|Shortstop)\s+){0,2}([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+(?:de|da|del|la|le|van|von|[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+)){1,2}(?:\s+(?:Jr\.|Sr\.|III|II))?)/i
  );
  if (withPlayerMatch) {
    const c = cleanCandidateName(withPlayerMatch[1]);
    if (c) return c;
  }

  // Pattern 4: "Tarik Skubal Agrees To Nine-Year, $450M Deal With Mets" / "Freddy Peralta Signs With Orioles"
  const beforeVerbMatch = cleaned.match(
    /^(?:(?:RHP|LHP|SP|RP|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|INF|UTL|Right-Hander|Left-Hander|Righty|Lefty|Southpaw)\s+)?([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+(?:de|da|del|la|le|van|von|[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+)){1,2}(?:\s+(?:Jr\.|Sr\.|III|II))?)\s+(?:Agrees?|Agreed|Signs?|Signed|Re-Signs?|Re-Signed|Extends?|Extended|Set\s+To\s+Sign|In\s+Agreement|Avoids?)\b/
  );
  if (beforeVerbMatch) {
    const c = cleanCandidateName(beforeVerbMatch[1]);
    if (c) return c;
  }

  return null;
}

function detectSigningTeamFromTitle(title) {
  const cleaned = String(title || '')
    .replace(/\bformer\s+(?:los angeles|new york|san diego|san francisco|st\.?\s*louis|tampa bay|kansas city|chicago|white|red|blue)?\s*[a-z'-]+\b/gi, ' ');
  const withTeamMatch = cleaned.match(/\b(?:with|join|joins|joined|returning\s+to|return\s+to)\s+(?:the\s+)?([^,.:;!?]{2,40})/i);
  if (withTeamMatch) {
    const afterWithTeam = detectTeamFromText(withTeamMatch[1]);
    if (afterWithTeam) return afterWithTeam;
  }
  return detectTeamFromText(cleaned) || detectTeamFromText(title);
}

function extractXmlTag(block, tagName) {
  const escaped = tagName.replace(/:/g, '\\:');
  const cdataRe = new RegExp(`<${escaped}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${escaped}>`, 'i');
  const cdataHit = block.match(cdataRe);
  if (cdataHit) return cdataHit[1];
  const plainRe = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  return block.match(plainRe)?.[1] || '';
}

function parseReportedDealsFromRss(xml, sourceLabel = 'MLB Trade Rumors') {
  const deals = [];
  const itemBlocks = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks.slice(0, 60)) {
    const rawTitle = extractXmlTag(block, 'title');
    const rawDesc = extractXmlTag(block, 'description');
    const rawContent = extractXmlTag(block, 'content:encoded');
    const link = decodeHtml(extractXmlTag(block, 'link')).trim();
    const pubDate = decodeHtml(extractXmlTag(block, 'pubDate')).trim();

    const title = decodeHtml(rawTitle);
    const description = decodeHtml(rawDesc);
    const contentText = decodeHtml(rawContent);
    const bodyText = contentText.length > description.length ? contentText : description;
    const leadBody = bodyText.slice(0, 800);

    if (!title) continue;
    if (SPECULATION_RUMOR_RE.test(title)) continue;
    if (!DEAL_ACTION_RE.test(title)) continue;

    // Only check title + opening 280 chars for minor-league deal phrasing so we never drop an MLB deal
    // whose 5th paragraph mentions a player's earlier career minor-league contract.
    const isMinorLeague =
      /\bminor league\b/i.test(title) ||
      /\bminor league (?:deal|contract)\b/i.test(leadBody.slice(0, 280));
    if (isMinorLeague) continue;

    const team = detectSigningTeamFromTitle(title);
    if (!team) continue;

    const firstLeadSentence = leadBody.split(/(?<=[.!?])\s+/)[0] || leadBody.slice(0, 220);
    const playerName =
      extractReportedPlayerName(title) || extractReportedPlayerName(firstLeadSentence);
    if (!playerName) continue;

    const moveType = /\b(extend|extends|extended|extension)\b/i.test(title)
      ? 'EXTENSION'
      : 'SIGNING';
    const { years, totalMillions, aav, confidence } = parseContractDetails(title, bodyText);
    const notesSnippet = pickBestContractNote(title, description, bodyText);
    const isoPub = safeIsoDate(pubDate);

    deals.push({
      external_id: `mlbtr-deal-${stableHash(`${team}:${normalizePersonKey(playerName)}`)}`,
      headline: title,
      source_name: `${sourceLabel} (Reported)`,
      source_url: link || 'https://www.mlbtraderumors.com',
      reported_at: isoPub,
      official_date: null,
      move_type: moveType,
      to_team: team,
      player_name: playerName,
      position: extractPositionFromText(`${title} ${leadBody.slice(0, 200)}`),
      contract_years: years,
      total_value_millions: totalMillions,
      aav_millions: aav,
      contract_confidence: confidence,
      contract_notes: notesSnippet || null,
    });
  }

  return deals;
}

function mergeReportedDealRecords(prev, deal) {
  // Prefer MLB Trade Rumors as canonical headline/source when both exist,
  // and always keep the highest-confidence contract terms.
  const prevIsMlbtr = /MLB Trade Rumors/i.test(prev.source_name || '');
  const nextIsMlbtr = /MLB Trade Rumors/i.test(deal.source_name || '');
  const prevConf = Number(prev.contract_confidence || 0);
  const nextConf = Number(deal.contract_confidence || 0);
  const useNextContract =
    nextConf > prevConf ||
    (nextConf === prevConf && !prev.total_value_millions && Boolean(deal.total_value_millions));
  const mergedYears = useNextContract
    ? deal.contract_years ?? prev.contract_years ?? null
    : prev.contract_years ?? deal.contract_years ?? null;
  const mergedTotal = useNextContract
    ? deal.total_value_millions ?? prev.total_value_millions ?? null
    : prev.total_value_millions ?? deal.total_value_millions ?? null;
  const mergedAav =
    mergedYears && mergedTotal
      ? Number((mergedTotal / mergedYears).toFixed(2))
      : useNextContract
      ? deal.aav_millions ?? prev.aav_millions ?? null
      : prev.aav_millions ?? deal.aav_millions ?? null;

  const base = !prevIsMlbtr && nextIsMlbtr ? deal : prev;
  return {
    ...base,
    contract_years: mergedYears,
    total_value_millions: mergedTotal,
    aav_millions: mergedAav,
    contract_confidence: Math.max(prevConf, nextConf),
    position: base.position || prev.position || deal.position || null,
    contract_notes: useNextContract
      ? deal.contract_notes || prev.contract_notes || null
      : prev.contract_notes || deal.contract_notes || null,
    _resolvedId: prev._resolvedId || deal._resolvedId || null,
    _resolvedPosition: prev._resolvedPosition || deal._resolvedPosition || null,
  };
}

async function fetchReportedContractDeals() {
  const feeds = [
    { url: 'https://www.mlbtraderumors.com/feed', label: 'MLB Trade Rumors' },
    { url: 'https://www.mlbtraderumors.com/feed?paged=2', label: 'MLB Trade Rumors' },
    { url: 'https://www.mlbtraderumors.com/feed?paged=3', label: 'MLB Trade Rumors' },
    { url: 'https://www.mlbtraderumors.com/feed?paged=4', label: 'MLB Trade Rumors' },
    { url: 'https://www.espn.com/espn/rss/mlb/news', label: 'ESPN' },
    { url: 'https://www.mlb.com/feeds/news/rss.xml', label: 'MLB.com' },
  ];
  const byKey = new Map();
  let feedsSucceeded = 0;

  await Promise.all(
    feeds.map(async ({ url, label }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; HotStoveTracker/2.4; +https://github.com/Hot-Stove-Tracker)',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
        });
        if (!res.ok) return;
        const xml = await res.text();
        if (!xml || !xml.includes('<item')) return;
        feedsSucceeded++;
        for (const deal of parseReportedDealsFromRss(xml, label)) {
          const dedupeKey = `${deal.to_team}:${normalizePersonKey(deal.player_name)}`;
          const prev = byKey.get(dedupeKey);
          if (!prev) {
            byKey.set(dedupeKey, deal);
          } else {
            byKey.set(dedupeKey, mergeReportedDealRecords(prev, deal));
          }
        }
      } catch {
        // Non-fatal if an RSS endpoint is unreachable or times out
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return { deals: Array.from(byKey.values()), feedsSucceeded };
}

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
  contract_years = null,
  total_value_millions = null,
  aav_millions = null,
  contract_notes = null,
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
    contract_years,
    total_value_millions,
    aav_millions,
    contract_notes,
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

  // Run lightweight malformed-row cleanup in parallel (preserving active REPORTED deals)
  try {
    await Promise.all([
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
  let reportedCount = 0;
  let upgradedCount = 0;
  let voidedCount = 0;
  let pricedDealsCount = 0;
  let rssFeedsOk = 0;
  const nowIso = new Date().toISOString();

  // Official MLB Stats API Transactions — All 30 MLB Teams (Last 45 Days + 1-day UTC buffer)
  try {
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    // Kick off RSS reported-deals fetch in parallel with official MLB Stats API transactions
    const reportedDealsPromise = fetchReportedContractDeals();

    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${ALL_MLB_TEAM_IDS}&startDate=${fmt(start)}&endDate=${fmt(end)}`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'HotStoveTracker/2.4' },
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

      const textPos = extractPositionFromText(desc);
      const apiPos = person?.primaryPosition?.abbreviation || null;
      const position =
        apiPos === 'P' && (textPos === 'RHP' || textPos === 'LHP')
          ? textPos
          : apiPos || textPos || null;

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

    // 3. Await reported contract years/dollars & attach to matching MLB signings/extensions
    //    (or add REPORTED signing row if a deal is widely reported before MLB's official wire posts it)
    const { deals: reportedDeals, feedsSucceeded } = await reportedDealsPromise;
    let dealsAttachedCount = 0;
    let reportedInsertedCount = 0;
    const freshlyParsedExtIds = new Set();

    // Track official signings by BOTH (team + normalized name) AND (team + player_id), plus latest official team per player
    const officialSigningKeys = new Set();
    const officialSigningByTeamId = new Set();
    const officialTeamByPlayerId = new Map(); // player_id -> { team, reportedAtMs }
    const officialTeamByPlayerName = new Map(); // normName -> { team, reportedAtMs }

    const registerOfficialSigning = (toTeam, playerId, playerName, reportedAtIso) => {
      if (!toTeam) return;
      const ts = reportedAtIso ? new Date(reportedAtIso).getTime() : 0;
      if (playerName) {
        const norm = normalizePersonKey(playerName);
        if (norm) {
          officialSigningKeys.add(`${toTeam}:${norm}`);
          const prev = officialTeamByPlayerName.get(norm);
          if (!prev || ts >= prev.reportedAtMs) {
            officialTeamByPlayerName.set(norm, { team: toTeam, reportedAtMs: ts });
          }
        }
      }
      if (playerId) {
        const pid = Number(playerId);
        if (Number.isInteger(pid) && pid > 0) {
          officialSigningByTeamId.add(`${toTeam}:id:${pid}`);
          const prev = officialTeamByPlayerId.get(pid);
          if (!prev || ts >= prev.reportedAtMs) {
            officialTeamByPlayerId.set(pid, { team: toTeam, reportedAtMs: ts });
          }
        }
      }
    };

    for (const r of rowsToUpsert) {
      if (['SIGNING', 'EXTENSION'].includes(r.move_type) && r.to_team) {
        registerOfficialSigning(r.to_team, r.player_id, r.player_name, r.reported_at);
      }
    }

    // Pull newest 1,000 existing signings/extensions (ordered newest-first!) so we never duplicate or wipe contract dollars
    const { data: existingSignings } = await supabase
      .from('transactions')
      .select('id, external_id, player_id, player_name, to_team, status, reported_at, contract_years, total_value_millions, aav_millions, contract_notes')
      .in('move_type', ['SIGNING', 'EXTENSION'])
      .order('reported_at', { ascending: false })
      .limit(1000);

    const existingContractByKey = new Map();
    const existingContractByTeamId = new Map();
    const saveContractCandidate = (map, key, dbRow) => {
      if (!key) return;
      const prev = map.get(key);
      if (!prev || (!prev.total_value_millions && dbRow.total_value_millions)) {
        map.set(key, {
          contract_years: dbRow.contract_years ?? null,
          total_value_millions: dbRow.total_value_millions ?? null,
          aav_millions: dbRow.aav_millions ?? null,
          contract_notes: dbRow.contract_notes || null,
        });
      }
    };

    for (const dbRow of existingSignings || []) {
      if (!dbRow.to_team) continue;
      if (dbRow.status === 'OFFICIAL') {
        registerOfficialSigning(dbRow.to_team, dbRow.player_id, dbRow.player_name, dbRow.reported_at);
      }
      if (dbRow.status !== 'VOIDED' && (dbRow.contract_years || dbRow.total_value_millions || dbRow.contract_notes)) {
        if (dbRow.player_name) {
          saveContractCandidate(existingContractByKey, `${dbRow.to_team}:${normalizePersonKey(dbRow.player_name)}`, dbRow);
        }
        if (dbRow.player_id) {
          saveContractCandidate(existingContractByTeamId, `${dbRow.to_team}:id:${Number(dbRow.player_id)}`, dbRow);
        }
      }
    }

    if (reportedDeals.length > 0) {
      // Resolve MLB player IDs upfront for all reported deals so nickname differences
      // (e.g. "Kike Hernandez" vs "Enrique Hernandez" or "Mike Soroka" vs "Michael Soroka")
      // still match and automatically upgrade to OFFICIAL with contract dollars intact!
      const uniqueReportedNames = Array.from(
        new Set(reportedDeals.map((d) => d.player_name).filter(Boolean))
      );
      const resolvedIds = new Map();
      await Promise.all(
        uniqueReportedNames.map(async (nm) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2500);
          try {
            const r = await fetch(
              `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(nm)}`,
              { signal: ctrl.signal }
            );
            if (r.ok) {
              const j = await r.json();
              const people = Array.isArray(j?.people) ? j.people : [];
              const person = people.find((p) => p.active) || people[0];
              if (person?.id) {
                resolvedIds.set(normalizePersonKey(nm), {
                  id: Number(person.id),
                  position: person.primaryPosition?.abbreviation || null,
                });
              }
            }
          } catch {
            // ignore
          } finally {
            clearTimeout(t);
          }
        })
      );

      // Deduplicate reported deals that resolve to the same team + MLB player_id
      // (e.g. "Mike Soroka" vs "Michael Soroka" across ESPN / MLB.com / MLBTR)
      const dedupedReportedList = [];
      const seenReportedByTeamId = new Map();
      for (const d of reportedDeals) {
        if (!d.to_team || !d.player_name) continue;
        const norm = normalizePersonKey(d.player_name);
        const matchPerson = resolvedIds.get(norm) || null;
        d._resolvedId = matchPerson?.id || null;
        d._resolvedPosition = matchPerson?.position || null;

        if (d._resolvedId) {
          const teamIdKey = `${d.to_team}:id:${d._resolvedId}`;
          const existingIdx = seenReportedByTeamId.get(teamIdKey);
          if (existingIdx !== undefined) {
            dedupedReportedList[existingIdx] = mergeReportedDealRecords(
              dedupedReportedList[existingIdx],
              d
            );
            continue;
          }
          seenReportedByTeamId.set(teamIdKey, dedupedReportedList.length);
        }
        dedupedReportedList.push(d);
      }

      const dealsByTeamAndName = new Map();
      const dealsByTeamAndId = new Map();
      for (const d of dedupedReportedList) {
        const norm = normalizePersonKey(d.player_name);
        dealsByTeamAndName.set(`${d.to_team}:${norm}`, d);
        if (d._resolvedId) {
          dealsByTeamAndId.set(`${d.to_team}:id:${d._resolvedId}`, d);
        }
      }

      // Attach reported contract terms onto matching official rows in rowsToUpsert (by team+id OR team+name)
      for (let idx = 0; idx < rowsToUpsert.length; idx++) {
        const r = rowsToUpsert[idx];
        if (!['SIGNING', 'EXTENSION'].includes(r.move_type) || !r.to_team) continue;
        const deal =
          (r.player_id && dealsByTeamAndId.get(`${r.to_team}:id:${Number(r.player_id)}`)) ||
          (r.player_name && dealsByTeamAndName.get(`${r.to_team}:${normalizePersonKey(r.player_name)}`)) ||
          null;

        if (deal) {
          rowsToUpsert[idx] = {
            ...r,
            contract_years: deal.contract_years ?? null,
            total_value_millions: deal.total_value_millions ?? null,
            aav_millions: deal.aav_millions ?? null,
            contract_notes: deal.contract_notes || null,
          };
          freshlyParsedExtIds.add(r.external_id);
          if (deal.total_value_millions || deal.contract_years) {
            dealsAttachedCount++;
          }
        }
      }

      // Parallel-update any older DB rows outside this 45-day upsert batch that just received reported terms
      const upsertExtSet = new Set(rowsToUpsert.map((r) => r.external_id));
      const olderDbUpdates = [];
      for (const dbRow of existingSignings || []) {
        if (!dbRow.to_team || dbRow.status === 'VOIDED' || upsertExtSet.has(dbRow.external_id)) continue;
        const deal =
          (dbRow.player_id && dealsByTeamAndId.get(`${dbRow.to_team}:id:${Number(dbRow.player_id)}`)) ||
          (dbRow.player_name && dealsByTeamAndName.get(`${dbRow.to_team}:${normalizePersonKey(dbRow.player_name)}`)) ||
          null;
        if (!deal) continue;
        const nextYears = deal.contract_years ?? null;
        const nextTotal = deal.total_value_millions ?? null;
        const nextAav = deal.aav_millions ?? null;
        const nextNotes = deal.contract_notes || dbRow.contract_notes || null;
        if (
          nextYears !== dbRow.contract_years ||
          nextTotal !== dbRow.total_value_millions ||
          nextAav !== dbRow.aav_millions
        ) {
          olderDbUpdates.push(
            supabase
              .from('transactions')
              .update({
                contract_years: nextYears,
                total_value_millions: nextTotal,
                aav_millions: nextAav,
                contract_notes: nextNotes,
                updated_at: nowIso,
              })
              .eq('id', dbRow.id)
          );
        }
      }
      if (olderDbUpdates.length > 0) {
        await Promise.all(olderDbUpdates);
      }

      // Add breaking reported signings/extensions NOT yet confirmed OFFICIAL on MLB's wire
      const unmatchedDeals = dedupedReportedList.filter((d) => {
        if (!d.to_team || !d.player_name) return false;
        const norm = normalizePersonKey(d.player_name);
        if (officialSigningKeys.has(`${d.to_team}:${norm}`)) return false;
        if (d._resolvedId && officialSigningByTeamId.has(`${d.to_team}:id:${d._resolvedId}`)) return false;
        // Also skip if MLB already confirmed this player officially signed with a DIFFERENT team after this report
        const repTs = d.reported_at ? new Date(d.reported_at).getTime() : 0;
        const offById = d._resolvedId ? officialTeamByPlayerId.get(d._resolvedId) : null;
        const offByName = officialTeamByPlayerName.get(norm);
        const offMatch = offById || offByName;
        if (offMatch && offMatch.team !== d.to_team && offMatch.reportedAtMs >= repTs - 36 * 60 * 60 * 1000) {
          return false;
        }
        return true;
      });

      for (const d of unmatchedDeals) {
        if (seenExtIds.has(d.external_id)) continue;
        seenExtIds.add(d.external_id);
        const baseRow = buildNormalizedRow({
          external_id: d.external_id,
          move_type: d.move_type,
          is_major_league: true,
          headline: d.headline,
          reported_at: d.reported_at,
          official_date: null,
          player_id: d._resolvedId || null,
          player_name: d.player_name,
          position: d._resolvedPosition || d.position,
          from_team: null,
          to_team: d.to_team,
          contract_years: d.contract_years ?? null,
          total_value_millions: d.total_value_millions ?? null,
          aav_millions: d.aav_millions ?? null,
          contract_notes: d.contract_notes || null,
          updated_at: nowIso,
        });
        rowsToUpsert.push({
          ...baseRow,
          status: 'REPORTED',
          source_name: d.source_name || 'MLB Trade Rumors (Reported)',
          source_url: d.source_url,
        });
        freshlyParsedExtIds.add(d.external_id);
        reportedInsertedCount++;
      }
    }

    // 4. Preserve any previously saved contract terms (from older REPORTED rows or manual edits)
    //    and collect existing external_ids for accurate new vs refreshed counts
    const existingIds = new Set();
    const existingContractsByExtId = new Map();
    const allExtIds = rowsToUpsert.map((r) => r.external_id);
    const LOOKUP_CHUNK = 200;
    for (let i = 0; i < allExtIds.length; i += LOOKUP_CHUNK) {
      const slice = allExtIds.slice(i, i + LOOKUP_CHUNK);
      const { data: foundRows } = await supabase
        .from('transactions')
        .select('external_id, contract_years, total_value_millions, aav_millions, contract_notes')
        .in('external_id', slice);
      for (const row of foundRows || []) {
        existingIds.add(row.external_id);
        if (row.contract_years || row.total_value_millions || row.contract_notes) {
          existingContractsByExtId.set(row.external_id, row);
        }
      }
    }

    for (let idx = 0; idx < rowsToUpsert.length; idx++) {
      const r = rowsToUpsert[idx];
      // If a fresh RSS article just parsed this signing with the improved parser, trust it
      // (so previously mis-parsed signing-bonus/option numbers self-heal on sync!)
      if (freshlyParsedExtIds.has(r.external_id)) continue;

      const savedByExt = existingContractsByExtId.get(r.external_id);
      const savedByTeamId =
        ['SIGNING', 'EXTENSION'].includes(r.move_type) && r.to_team && r.player_id
          ? existingContractByTeamId.get(`${r.to_team}:id:${Number(r.player_id)}`)
          : null;
      const savedByKey =
        ['SIGNING', 'EXTENSION'].includes(r.move_type) && r.to_team && r.player_name
          ? existingContractByKey.get(`${r.to_team}:${normalizePersonKey(r.player_name)}`)
          : null;
      const fallback = savedByExt || savedByTeamId || savedByKey;
      if (fallback) {
        rowsToUpsert[idx] = {
          ...r,
          contract_years: r.contract_years ?? fallback.contract_years ?? null,
          total_value_millions: r.total_value_millions ?? fallback.total_value_millions ?? null,
          aav_millions: r.aav_millions ?? fallback.aav_millions ?? null,
          contract_notes: r.contract_notes || fallback.contract_notes || null,
        };
      }
    }

    // Upgrade REPORTED -> OFFICIAL (delete superseded REPORTED row after MLB confirms),
    // auto-clean malformed/duplicate REPORTED rows (e.g. "righty Gausman", "lefty Peterson"),
    // and mark stale REPORTED rows VOIDED if player officially signed with a DIFFERENT team
    {
      const { data: oldReportedRows } = await supabase
        .from('transactions')
        .select('id, external_id, to_team, player_id, player_name, reported_at, total_value_millions, status')
        .eq('status', 'REPORTED')
        .like('external_id', 'mlbtr-deal-%');

      const supersededIds = [];
      const cleanupDuplicateIds = [];
      const voidedIds = [];
      const seenReportedByTeamIdDb = new Map();

      for (const row of oldReportedRows || []) {
        const pid = row.player_id ? Number(row.player_id) : null;
        const norm = row.player_name ? normalizePersonKey(row.player_name) : '';

        // 1. Auto-remove previously mis-parsed descriptor names (e.g. "righty Gausman", "lefty Peterson")
        if (!row.player_name || !cleanCandidateName(row.player_name)) {
          cleanupDuplicateIds.push(row.id);
          continue;
        }

        // 2. Delete superseded REPORTED row once MLB officially confirms same team + player
        const sameTeamConfirmed =
          (row.to_team && pid && officialSigningByTeamId.has(`${row.to_team}:id:${pid}`)) ||
          (row.to_team && norm && officialSigningKeys.has(`${row.to_team}:${norm}`));

        if (sameTeamConfirmed) {
          supersededIds.push(row.id);
          continue;
        }

        // 3. Deduplicate any existing REPORTED rows sharing the same team + player_id
        if (row.to_team && pid) {
          const teamIdKey = `${row.to_team}:id:${pid}`;
          const prev = seenReportedByTeamIdDb.get(teamIdKey);
          if (prev) {
            const keepCurrent =
              Number(row.total_value_millions || 0) > Number(prev.total_value_millions || 0);
            if (keepCurrent) {
              cleanupDuplicateIds.push(prev.id);
              seenReportedByTeamIdDb.set(teamIdKey, row);
            } else {
              cleanupDuplicateIds.push(row.id);
            }
            continue;
          }
          seenReportedByTeamIdDb.set(teamIdKey, row);
        }

        // 4. Mark stale REPORTED row VOIDED if player officially signed with a DIFFERENT team
        const repTs = row.reported_at ? new Date(row.reported_at).getTime() : 0;
        const offMatch =
          (pid && officialTeamByPlayerId.get(pid)) ||
          (norm && officialTeamByPlayerName.get(norm)) ||
          null;
        if (
          offMatch &&
          row.to_team &&
          offMatch.team !== row.to_team &&
          offMatch.reportedAtMs >= repTs - 36 * 60 * 60 * 1000
        ) {
          voidedIds.push(row.id);
        }
      }

      if (supersededIds.length > 0) {
        await supabase.from('transactions').delete().in('id', supersededIds);
        upgradedCount = supersededIds.length;
      }
      if (cleanupDuplicateIds.length > 0) {
        await supabase.from('transactions').delete().in('id', cleanupDuplicateIds);
      }
      if (voidedIds.length > 0) {
        await supabase
          .from('transactions')
          .update({ status: 'VOIDED', updated_at: nowIso })
          .in('id', voidedIds);
        voidedCount = voidedIds.length;
      }
    }

    // 5. Batched upsert in chunks of 150
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

    reportedCount = reportedInsertedCount;
    pricedDealsCount = rowsToUpsert.filter((r) => Number(r.total_value_millions || 0) > 0).length;
    rssFeedsOk = feedsSucceeded;
  } catch (err) {
    return res.status(500).json({ error: `MLB API sync failed: ${err.message}` });
  }

  const extraBits = [
    upgradedCount > 0 ? `${upgradedCount} confirmed official` : null,
    reportedCount > 0 ? `${reportedCount} reported` : null,
    voidedCount > 0 ? `${voidedCount} voided` : null,
    pricedDealsCount > 0 ? `${pricedDealsCount} contracts priced` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const summary =
    addedCount > 0 || upgradedCount > 0
      ? `Synced: ${addedCount} new ${addedCount === 1 ? 'move' : 'moves'}${extraBits ? ` • ${extraBits}` : ''}`
      : `Feed up to date (${majorLeagueCount} MLB moves${extraBits ? ` • ${extraBits}` : ''})`;

  await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_synced_at: nowIso, last_sync_summary: summary });

  return res.status(200).json({
    skipped: false,
    addedCount,
    updatedCount,
    upgradedCount,
    voidedCount,
    majorLeagueCount,
    minorLeagueCount,
    reportedCount,
    pricedDealsCount,
    rssFeedsOk,
    last_synced_at: nowIso,
    summary,
  });
}
