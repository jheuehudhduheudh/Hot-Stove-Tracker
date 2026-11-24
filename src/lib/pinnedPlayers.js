// Hot Stove Tracker — Pinned Favorite Players & Guest/Account Profile Storage
// Mirrors the browser localStorage pattern used by Starred Teams (`hst_my_teams`)
// with strict schema validation, safe fallbacks, and a clean migration path for user accounts.

import { MLB_TEAMS } from '../data/mlbData';

export const PINNED_PLAYERS_STORAGE_KEY = 'hst_pinned_players';
export const PROFILE_STORAGE_KEY = 'hst_profile';
export const PINNED_SCHEMA_VERSION = 1;

const ACTIVE_TEAM_ABBR_SET = new Set(MLB_TEAMS.map((t) => t.abbr));

const ACTIVE_TEAM_ALIASES = {
  OAK: 'ATH',
  WAS: 'WSH',
  CHW: 'CWS',
  TBR: 'TB',
  SFG: 'SF',
  SDP: 'SD',
  KCR: 'KC',
};

const VALID_POSITIONS = new Set([
  'P', 'SP', 'RP', 'RHP', 'LHP',
  'C', '1B', '2B', '3B', 'SS',
  'LF', 'CF', 'RF', 'OF',
  'DH', 'IF', 'INF', 'UT', 'UTL', 'TWP',
]);

const NON_PLAYER_NAME_PATTERN = /\b(cash|ptbnl|player to be named|international bonus|draft pick|considerations)\b/i;

function safeReadStorage(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a team abbreviation or name strictly against the 30 active MLB franchises.
 * Returns null for discontinued teams (e.g., Expos, Pilots, Senators), Free Agents,
 * generic "MLB" placeholders, or missing values so the UI cleanly omits team labels.
 */
export function resolveActiveTeamAbbr(teamAbbrOrName) {
  if (!teamAbbrOrName || typeof teamAbbrOrName !== 'string') return null;
  const trimmed = teamAbbrOrName.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (upper === 'MLB' || upper === 'FA' || upper === 'FREE AGENT' || upper === 'RETIRED' || upper === 'MILB') {
    return null;
  }
  if (ACTIVE_TEAM_ABBR_SET.has(upper)) return upper;
  if (ACTIVE_TEAM_ALIASES[upper]) return ACTIVE_TEAM_ALIASES[upper];

  const lower = trimmed.toLowerCase();
  const byName = MLB_TEAMS.find(
    (t) => t.name.toLowerCase() === lower || t.short.toLowerCase() === lower
  );
  return byName ? byName.abbr : null;
}

export function normalizePosition(position, fallbackHeadline = '') {
  if (typeof position === 'string') {
    const upper = position.trim().toUpperCase();
    if (VALID_POSITIONS.has(upper)) return upper;
  }
  if (typeof fallbackHeadline === 'string' && fallbackHeadline) {
    const match = fallbackHeadline.match(
      /\b(RHP|LHP|SP|RP|TWP|1B|2B|3B|SS|LF|CF|RF|OF|DH|INF|UTL|C)\b/
    );
    if (match && VALID_POSITIONS.has(match[1])) return match[1];
  }
  return 'MLB';
}

export function getPlayerInitials(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'ML';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Determines whether a player can be pinned:
 * - Allowed: active MLB players, retired MLB players, older/historical MLB players,
 *   and players from discontinued MLB teams.
 * - Excluded: minor-league / unranked prospects and non-player trade assets.
 */
export function isEligibleToPinPlayer(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;

  const rawId = candidate.playerId ?? candidate.id ?? candidate.player_id;
  const numId = Number(rawId);
  if (!Number.isInteger(numId) || numId <= 0) return false;

  const name = String(candidate.fullName ?? candidate.playerName ?? candidate.player_name ?? '').trim();
  if (!name || name.toLowerCase() === 'unknown' || name.toLowerCase() === 'unknown player') {
    return false;
  }
  if (NON_PLAYER_NAME_PATTERN.test(name)) return false;

  // Explicit prospect / minor-league flags
  if (candidate.isProspect === true) return false;
  if (candidate.is_major_league === false || candidate.isMajorLeague === false) return false;

  // For MLB Stats API search / full-player objects, mlbDebutDate reliably separates
  // MLB players (active, retired, historical, discontinued-team) from MiLB prospects.
  if (candidate.requireDebutCheck === true) {
    const debut = typeof candidate.mlbDebutDate === 'string' ? candidate.mlbDebutDate.trim() : '';
    if (!debut) return false;
  }

  return true;
}

export function normalizePinnedPlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const rawId = raw.playerId ?? raw.id ?? raw.player_id;
  const playerId = Number(rawId);
  if (!Number.isInteger(playerId) || playerId <= 0) return null;

  const fullName = String(raw.fullName ?? raw.playerName ?? raw.player_name ?? '').trim();
  if (!fullName || NON_PLAYER_NAME_PATTERN.test(fullName)) return null;

  const teamAbbr = resolveActiveTeamAbbr(raw.teamAbbr ?? raw.currentTeamAbbr ?? raw.team ?? null);
  const position = normalizePosition(raw.position, raw.headline || '');
  const active = typeof raw.active === 'boolean' ? raw.active : null;
  const mlbDebutDate = typeof raw.mlbDebutDate === 'string' ? raw.mlbDebutDate.trim().slice(0, 10) : '';
  const pinnedAt =
    typeof raw.pinnedAt === 'string' && !Number.isNaN(new Date(raw.pinnedAt).getTime())
      ? raw.pinnedAt
      : new Date().toISOString();

  return {
    playerId,
    fullName,
    position,
    teamAbbr,
    active,
    mlbDebutDate,
    pinnedAt,
  };
}

export function loadPinnedPlayers() {
  const raw = safeReadStorage(PINNED_PLAYERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.pinnedPlayers)
      ? parsed.pinnedPlayers
      : [];

    const seen = new Set();
    const clean = [];
    for (const item of list) {
      const normalized = normalizePinnedPlayer(item);
      if (!normalized) continue;
      if (seen.has(normalized.playerId)) continue;
      seen.add(normalized.playerId);
      clean.push(normalized);
    }
    return clean;
  } catch {
    return [];
  }
}

export function savePinnedPlayers(players) {
  const safeList = Array.isArray(players)
    ? players.map(normalizePinnedPlayer).filter(Boolean)
    : [];
  return safeWriteStorage(PINNED_PLAYERS_STORAGE_KEY, JSON.stringify(safeList));
}

export function createDefaultGuestProfile() {
  return {
    version: PINNED_SCHEMA_VERSION,
    mode: 'guest', // 'guest' | 'authenticated'
    username: null,
    userId: null,
    updatedAt: null,
  };
}

export function loadUserProfile() {
  const raw = safeReadStorage(PROFILE_STORAGE_KEY);
  if (!raw) return createDefaultGuestProfile();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createDefaultGuestProfile();
    }
    const mode = parsed.mode === 'authenticated' && typeof parsed.username === 'string' && parsed.username.trim()
      ? 'authenticated'
      : 'guest';
    return {
      version: PINNED_SCHEMA_VERSION,
      mode,
      username: mode === 'authenticated' ? parsed.username.trim() : null,
      userId: mode === 'authenticated' && parsed.userId ? String(parsed.userId) : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return createDefaultGuestProfile();
  }
}

export function saveUserProfile(profile) {
  const safeProfile = {
    ...createDefaultGuestProfile(),
    ...(profile && typeof profile === 'object' ? profile : {}),
    version: PINNED_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  return safeWriteStorage(PROFILE_STORAGE_KEY, JSON.stringify(safeProfile));
}

export function getProfileDisplayName(profile) {
  if (profile?.mode === 'authenticated' && typeof profile.username === 'string' && profile.username.trim()) {
    return profile.username.trim();
  }
  return 'Guest';
}

/**
 * Account-migration helper for future auth rollout:
 * Merges locally pinned Guest players with an authenticated account's saved pins,
 * deduplicating by playerId and preserving the richest available metadata.
 */
export function mergeGuestPinsWithAccount(localPins = [], remotePins = []) {
  const mergedMap = new Map();

  for (const item of [...remotePins, ...localPins]) {
    const norm = normalizePinnedPlayer(item);
    if (!norm) continue;

    const existing = mergedMap.get(norm.playerId);
    if (!existing) {
      mergedMap.set(norm.playerId, norm);
    } else {
      mergedMap.set(norm.playerId, {
        ...existing,
        fullName: existing.fullName || norm.fullName,
        position: existing.position !== 'MLB' ? existing.position : norm.position,
        teamAbbr: existing.teamAbbr || norm.teamAbbr,
        active: existing.active !== null ? existing.active : norm.active,
        mlbDebutDate: existing.mlbDebutDate || norm.mlbDebutDate,
        pinnedAt: existing.pinnedAt < norm.pinnedAt ? existing.pinnedAt : norm.pinnedAt,
      });
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) =>
    String(b.pinnedAt || '').localeCompare(String(a.pinnedAt || ''))
  );
}
