// Hot Stove Tracker — Card Pack Engine (Series Print Runs, 6h Cooldown, Fair Roll Logic)

export const CURRENT_SERIES = '2026-27 Hot Stove';
export const PACK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MAX_PINNED_CARDS = 6;
const VAULT_STORAGE_KEY = 'hst_pack_vault_v1';

export const RARITY_TIERS = [
  {
    id: 'OBSIDIAN_1',
    name: 'Obsidian 1/1',
    shortLabel: '1/1 OBSIDIAN',
    odds: 0.001, // 0.1%
    oddsLabel: '0.1%',
    serialCap: 1,
    rank: 6,
    accent: '#ef4444',
    badgeClass: 'bg-zinc-950 text-red-400 border border-red-500/60',
    cardClass: 'hst-card-obsidian',
  },
  {
    id: 'SCRIPT_10',
    name: 'Gold Ink Script',
    shortLabel: '/10 SCRIPT',
    odds: 0.004, // 0.4%
    oddsLabel: '0.4%',
    serialCap: 10,
    rank: 5,
    accent: '#f59e0b',
    badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-400/60',
    cardClass: 'hst-card-script',
  },
  {
    id: 'GOLD_25',
    name: 'Gold Foil',
    shortLabel: '/25 GOLD',
    odds: 0.015, // 1.5%
    oddsLabel: '1.5%',
    serialCap: 25,
    rank: 4,
    accent: '#eab308',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/50',
    cardClass: 'hst-card-gold',
  },
  {
    id: 'CRIMSON_99',
    name: 'Crimson Chrome',
    shortLabel: '/99 CRIMSON',
    odds: 0.05, // 5.0%
    oddsLabel: '5.0%',
    serialCap: 99,
    rank: 3,
    accent: '#dc2626',
    badgeClass: 'bg-red-600/20 text-red-300 border border-red-500/50',
    cardClass: 'hst-card-crimson',
  },
  {
    id: 'HOLO',
    name: 'Holo Foil',
    shortLabel: 'HOLO FOIL',
    odds: 0.16, // 16.0%
    oddsLabel: '16.0%',
    serialCap: null,
    rank: 2,
    accent: '#a78bfa',
    badgeClass: 'bg-violet-500/20 text-violet-300 border border-violet-400/40',
    cardClass: 'hst-card-holo',
  },
  {
    id: 'BASE',
    name: 'Base',
    shortLabel: 'BASE',
    odds: 0.77, // 77.0%
    oddsLabel: '77.0%',
    serialCap: null,
    rank: 1,
    accent: '#71717a',
    badgeClass: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    cardClass: 'hst-card-base',
  },
];

export const RARITY_BY_ID = Object.fromEntries(RARITY_TIERS.map((r) => [r.id, r]));

// Fallback stars if feed & free agents haven't loaded yet
const FALLBACK_HOT_STOVE_POOL = [
  { playerId: 669373, fullName: 'Tarik Skubal', teamAbbr: 'NYM', position: 'SP', statLine: '2.39 ERA • 0.92 WHIP • 228 K', sourceTag: '2026-27 Hot Stove' },
  { playerId: 660271, fullName: 'Shohei Ohtani', teamAbbr: 'LAD', position: 'DH', statLine: '.310 AVG • 54 HR • 1.036 OPS', sourceTag: '2026-27 Hot Stove' },
  { playerId: 592450, fullName: 'Aaron Judge', teamAbbr: 'NYY', position: 'OF', statLine: '.322 AVG • 58 HR • 1.159 OPS', sourceTag: '2026-27 Hot Stove' },
  { playerId: 665742, fullName: 'Juan Soto', teamAbbr: 'NYM', position: 'OF', statLine: '.288 AVG • 41 HR • .989 OPS', sourceTag: '2026-27 Hot Stove' },
  { playerId: 677951, fullName: 'Bobby Witt Jr.', teamAbbr: 'KC', position: 'SS', statLine: '.332 AVG • 32 HR • 31 SB', sourceTag: '2026-27 Hot Stove' },
  { playerId: 669160, fullName: 'Dustin May', teamAbbr: 'CWS', position: 'SP', statLine: 'Signed Free Agent • CWS', sourceTag: '2026-27 Hot Stove' },
  { playerId: 543243, fullName: 'Sonny Gray', teamAbbr: 'MIN', position: 'SP', statLine: 'Signed Free Agent • MIN', sourceTag: '2026-27 Hot Stove' },
  { playerId: 668227, fullName: 'Randy Arozarena', teamAbbr: 'SEA', position: 'LF', statLine: '2026-27 Free Agent Class', sourceTag: '2026-27 Hot Stove' },
  { playerId: 650633, fullName: 'Michael King', teamAbbr: 'SD', position: 'SP', statLine: '2026-27 Free Agent Class', sourceTag: '2026-27 Hot Stove' },
  { playerId: 673548, fullName: 'Seiya Suzuki', teamAbbr: 'CHC', position: 'RF', statLine: '2026-27 Free Agent Class', sourceTag: '2026-27 Hot Stove' },
  { playerId: 663656, fullName: 'Kyle Tucker', teamAbbr: 'CHC', position: 'RF', statLine: 'MLB All-Star Outfielder', sourceTag: '2026-27 Hot Stove' },
  { playerId: 683002, fullName: 'Gunnar Henderson', teamAbbr: 'BAL', position: 'SS', statLine: '.281 AVG • 37 HR • .893 OPS', sourceTag: '2026-27 Hot Stove' },
];

export const CLASSIC_TEST_GAMES = [
  { label: '2026 WS Game 5 (MIL @ TB)', date: '2026-10-28', hint: 'World Series' },
  { label: '2026 WS Game 4 (12 Inn)', date: '2026-10-27', hint: 'Postseason' },
  { label: 'July 4, 2026 Slate', date: '2026-07-04', hint: 'Midseason' },
  { label: '2026 Opening Day', date: '2026-03-28', hint: 'Opening Slate' },
];

export function createDefaultVault() {
  return {
    handle: 'collector',
    lastPackAt: null,
    totalPacksOpened: 0,
    cards: [],
    pinnedIds: [],
    claimedGamePks: [],
    serialCounters: {},
    testMode: false,
  };
}

export function loadPackVault() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return createDefaultVault();
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultVault(),
      ...parsed,
      cards: Array.isArray(parsed?.cards) ? parsed.cards : [],
      pinnedIds: Array.isArray(parsed?.pinnedIds) ? parsed.pinnedIds : [],
      claimedGamePks: Array.isArray(parsed?.claimedGamePks) ? parsed.claimedGamePks : [],
      serialCounters: parsed?.serialCounters && typeof parsed.serialCounters === 'object' ? parsed.serialCounters : {},
    };
  } catch {
    return createDefaultVault();
  }
}

export function savePackVault(vault) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch {
    // ignore quota errors
  }
}

export function getCooldownRemainingMs(vault, nowMs = Date.now()) {
  if (!vault || vault.testMode || !vault.lastPackAt) return 0;
  const elapsed = nowMs - Number(vault.lastPackAt);
  return Math.max(0, PACK_COOLDOWN_MS - elapsed);
}

export function formatCooldownShort(ms) {
  if (!ms || ms <= 0) return 'Pack Ready';
  const totalSec = Math.ceil(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

export function buildHotStovePool(freeAgents = [], transactions = []) {
  const byId = new Map();

  for (const fa of freeAgents || []) {
    if (!fa?.playerId || !fa?.fullName) continue;
    byId.set(String(fa.playerId), {
      playerId: fa.playerId,
      fullName: fa.fullName,
      teamAbbr: fa.isSigned && fa.signedTeam ? fa.signedTeam : fa.lastTeam || 'MLB',
      position: fa.position || 'MLB',
      statLine: fa.statLine || (fa.isSigned ? `Signed with ${fa.signedTeam}` : '2026-27 Free Agent'),
      sourceTag: fa.isSigned ? `Signed • ${fa.signedTeam}` : '2026-27 Free Agent',
    });
  }

  for (const tx of transactions || []) {
    if (!tx?.player_id || !tx?.player_name) continue;
    const key = String(tx.player_id);
    if (!byId.has(key)) {
      const teamAbbr = tx.to_team || tx.from_team || 'MLB';
      const dateStamp = tx.official_date || (tx.reported_at ? String(tx.reported_at).slice(0, 10) : '');
      byId.set(key, {
        playerId: tx.player_id,
        fullName: tx.player_name,
        teamAbbr,
        position: 'MLB',
        statLine: tx.total_value_millions > 0
          ? `$${tx.total_value_millions}M Deal • ${teamAbbr}`
          : `${(tx.move_type || 'MOVE').replace('_', ' ')} • ${dateStamp || 'Official'}`,
        sourceTag: dateStamp ? `Wire • ${dateStamp}` : 'Official MLB Wire',
      });
    }
  }

  const list = Array.from(byId.values());
  return list.length >= 6 ? list : [...list, ...FALLBACK_HOT_STOVE_POOL];
}

export function buildBoxScorePool(boxScore) {
  if (!boxScore) return [];
  const awayAbbr = boxScore.away?.abbr || 'AWY';
  const homeAbbr = boxScore.home?.abbr || 'HME';
  const matchup = `${awayAbbr} @ ${homeAbbr}`;
  const gameDate = boxScore.date || boxScore.officialDate || '';
  const scoreLine =
    boxScore.away?.runs !== undefined && boxScore.home?.runs !== undefined
      ? `${awayAbbr} ${boxScore.away.runs} – ${homeAbbr} ${boxScore.home.runs}`
      : matchup;

  const byId = new Map();

  const addSide = (side, teamAbbr) => {
    for (const b of side?.batters || []) {
      if (!b?.playerId || !b?.fullName) continue;
      const parts = [`${b.h ?? 0}-${b.ab ?? 0}`];
      if (b.hr > 0) parts.push(`${b.hr} HR`);
      if (b.rbi > 0) parts.push(`${b.rbi} RBI`);
      if (b.r > 0) parts.push(`${b.r} R`);
      if (b.bb > 0) parts.push(`${b.bb} BB`);
      byId.set(String(b.playerId), {
        playerId: b.playerId,
        fullName: b.fullName,
        teamAbbr,
        position: b.position || 'BAT',
        statLine: parts.join(', '),
        sourceTag: `${matchup}${gameDate ? ` • ${gameDate}` : ''}`,
        gameMatchup: scoreLine,
      });
    }
    for (const p of side?.pitchers || []) {
      if (!p?.playerId || !p?.fullName) continue;
      const parts = [`${p.ip ?? '0.0'} IP`, `${p.er ?? 0} ER`, `${p.so ?? 0} K`];
      if (p.note) parts.push(p.note.replace(/[()]/g, ''));
      byId.set(String(p.playerId), {
        playerId: p.playerId,
        fullName: p.fullName,
        teamAbbr,
        position: 'P',
        statLine: parts.join(' • '),
        sourceTag: `${matchup}${gameDate ? ` • ${gameDate}` : ''}`,
        gameMatchup: scoreLine,
      });
    }
  };

  addSide(boxScore.away, awayAbbr);
  addSide(boxScore.home, homeAbbr);
  return Array.from(byId.values());
}

function rollWeightedRarity() {
  const r = Math.random();
  let acc = 0;
  for (const tier of RARITY_TIERS) {
    acc += tier.odds;
    if (r < acc) return tier;
  }
  return RARITY_BY_ID.BASE;
}

function getTierDowngradeOrder(startTierId) {
  const startIdx = RARITY_TIERS.findIndex((t) => t.id === startTierId);
  if (startIdx < 0) return [RARITY_BY_ID.BASE];
  return RARITY_TIERS.slice(startIdx);
}

/**
 * Mints 1 card using the Fair Roll + Series Print-Run + 1-Per-User Numbered Cap rule set.
 */
export function ripSinglePack({
  vault,
  pool,
  packMode = 'HOT_STOVE',
  gamePk = null,
  series = CURRENT_SERIES,
  forcedRarityId = null,
}) {
  const nowMs = Date.now();

  if (!vault.testMode) {
    const remaining = getCooldownRemainingMs(vault, nowMs);
    if (remaining > 0) {
      return {
        ok: false,
        error: `Next pack unlocks in ${formatCooldownShort(remaining)}.`,
      };
    }
    if (packMode === 'GAME_CHECKIN' && gamePk && vault.claimedGamePks.includes(String(gamePk))) {
      return {
        ok: false,
        error: 'You already claimed a pack from this game.',
      };
    }
  }

  const candidates = Array.isArray(pool) && pool.length > 0 ? pool : FALLBACK_HOT_STOVE_POOL;
  const rolledTier =
    vault.testMode && forcedRarityId && RARITY_BY_ID[forcedRarityId]
      ? RARITY_BY_ID[forcedRarityId]
      : rollWeightedRarity();

  const counters = { ...(vault.serialCounters || {}) };
  let chosenTier = RARITY_BY_ID.BASE;
  let chosenPlayer = null;
  let mintedSerial = null;

  // Fair Roll Logic: Roll rarity first, then match an eligible player who:
  // - Still has remaining copies in this Series print run
  // - Is not already owned by this user at that numbered rarity tier
  for (const tier of getTierDowngradeOrder(rolledTier.id)) {
    if (!tier.serialCap) {
      chosenTier = tier;
      chosenPlayer = candidates[Math.floor(Math.random() * candidates.length)];
      mintedSerial = null;
      break;
    }

    const eligible = candidates.filter((p) => {
      const counterKey = `${series}|${p.playerId}|${tier.id}`;
      const used = counters[counterKey] || 0;
      if (used >= tier.serialCap) return false;
      const userAlreadyOwns = vault.cards.some(
        (c) =>
          String(c.playerId) === String(p.playerId) &&
          c.rarityId === tier.id &&
          c.series === series
      );
      return !userAlreadyOwns;
    });

    if (eligible.length > 0) {
      chosenTier = tier;
      chosenPlayer = eligible[Math.floor(Math.random() * eligible.length)];
      const counterKey = `${series}|${chosenPlayer.playerId}|${tier.id}`;
      mintedSerial = (counters[counterKey] || 0) + 1;
      counters[counterKey] = mintedSerial;
      break;
    }
  }

  if (!chosenPlayer) {
    chosenTier = RARITY_BY_ID.BASE;
    chosenPlayer = candidates[Math.floor(Math.random() * candidates.length)];
    mintedSerial = null;
  }

  // Stack Base / Holo duplicates cleanly if same player + same unnumbered rarity + same source mode
  const existingIdx = !chosenTier.serialCap
    ? vault.cards.findIndex(
        (c) =>
          String(c.playerId) === String(chosenPlayer.playerId) &&
          c.rarityId === chosenTier.id &&
          c.series === series &&
          c.packMode === packMode &&
          String(c.gamePk || '') === String(gamePk || '')
      )
    : -1;

  let nextCards;
  let pulledCard;
  let isDuplicate = false;

  if (existingIdx >= 0) {
    isDuplicate = true;
    const prev = vault.cards[existingIdx];
    pulledCard = {
      ...prev,
      copies: (prev.copies || 1) + 1,
      lastPulledAt: new Date(nowMs).toISOString(),
    };
    nextCards = [pulledCard, ...vault.cards.filter((_, i) => i !== existingIdx)];
  } else {
    pulledCard = {
      uid: `card-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      playerId: chosenPlayer.playerId,
      fullName: chosenPlayer.fullName,
      teamAbbr: chosenPlayer.teamAbbr || 'MLB',
      position: chosenPlayer.position || 'MLB',
      statLine: chosenPlayer.statLine || '',
      sourceTag: chosenPlayer.sourceTag || series,
      gameMatchup: chosenPlayer.gameMatchup || null,
      rarityId: chosenTier.id,
      serialNumber: mintedSerial,
      serialCap: chosenTier.serialCap,
      series,
      packMode,
      gamePk: gamePk ? String(gamePk) : null,
      copies: 1,
      pulledAt: new Date(nowMs).toISOString(),
      isTestPull: Boolean(vault.testMode),
    };
    nextCards = [pulledCard, ...vault.cards];
  }

  const nextClaimedGames =
    packMode === 'GAME_CHECKIN' && gamePk && !vault.claimedGamePks.includes(String(gamePk))
      ? [...vault.claimedGamePks, String(gamePk)]
      : vault.claimedGamePks;

  const nextVault = {
    ...vault,
    lastPackAt: vault.testMode ? vault.lastPackAt : nowMs,
    totalPacksOpened: (vault.totalPacksOpened || 0) + 1,
    cards: nextCards,
    claimedGamePks: nextClaimedGames,
    serialCounters: counters,
  };

  return {
    ok: true,
    card: pulledCard,
    isDuplicate,
    vault: nextVault,
  };
}
