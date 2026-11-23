import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Package, Sparkles, Pin, Download, Clock, RotateCcw,
  Search, Layers, Check, X, Flame, Calendar, User
} from 'lucide-react';
import {
  RARITY_TIERS,
  RARITY_BY_ID,
  CURRENT_SERIES,
  MAX_PINNED_CARDS,
  CLASSIC_TEST_GAMES,
  formatCooldownShort,
  getCooldownRemainingMs,
  buildHotStovePool,
  buildBoxScorePool,
  ripSinglePack,
} from '../lib/packEngine';
import { exportPulledCardPng, exportShowcasePng } from '../lib/cardExporter';
import { getTeamInfo } from '../data/mlbData';

function CollectibleCard({
  card,
  isPinned,
  onTogglePin,
  onOpenPlayer,
  onExportPng,
  TeamLogo,
  compact = false,
}) {
  const [imgErr, setImgErr] = useState(false);
  const rarity = RARITY_BY_ID[card.rarityId] || RARITY_BY_ID.BASE;
  const team = getTeamInfo(card.teamAbbr);
  const serialText = card.serialCap
    ? `#${String(card.serialNumber || 1).padStart(card.serialCap >= 100 ? 3 : 2, '0')}/${card.serialCap}`
    : rarity.shortLabel;

  const initials = (card.fullName || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`relative rounded-lg overflow-hidden border transition-all duration-200 flex flex-col justify-between ${rarity.cardClass} ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: team.color }}
      />

      <div className="flex items-center justify-between gap-2 pt-0.5 mb-2.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-stat text-[10px] font-extrabold uppercase tracking-wider ${rarity.badgeClass}`}
        >
          {serialText}
        </span>

        <div className="flex items-center gap-1">
          {card.copies > 1 && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-300 font-stat text-[10px] font-bold">
              ×{card.copies}
            </span>
          )}
          {onTogglePin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(card.uid);
              }}
              title={isPinned ? 'Unpin from Showcase' : 'Pin to Profile Showcase (max 6)'}
              className={`p-1.5 rounded-md border transition ${
                isPinned
                  ? 'bg-red-600/20 border-red-500/50 text-red-400'
                  : 'border-white/10 bg-black/30 text-zinc-400 hover:text-white hover:border-white/25'
              }`}
            >
              <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <div
        onClick={() => onOpenPlayer && onOpenPlayer(card.playerId, card.fullName, card.teamAbbr)}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div
          className={`${compact ? 'w-12 h-12' : 'w-14 h-14'} rounded-lg overflow-hidden shrink-0 bg-zinc-900 flex items-center justify-center relative`}
          style={{ border: `2px solid ${team.color}` }}
        >
          {card.playerId && !imgErr ? (
            <img
              src={`https://midfield.mlbstatic.com/v1/people/${card.playerId}/spots/120`}
              alt={card.fullName}
              onError={() => setImgErr(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-bold text-sm text-white">{initials}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-stat font-bold text-zinc-400">
            {TeamLogo && <TeamLogo abbr={team.abbr} size="xs" className="!w-3.5 !h-3.5" />}
            <span>{team.abbr}</span>
            <span>•</span>
            <span>{card.position}</span>
          </div>
          <div className="font-display font-extrabold text-sm sm:text-base text-white truncate group-hover:text-red-400 transition-colors">
            {card.fullName}
          </div>
          {(card.rarityId === 'SCRIPT_10' || card.rarityId === 'OBSIDIAN_1') && (
            <div
              className={`text-xs italic font-serif tracking-wide truncate -mt-0.5 ${
                card.rarityId === 'OBSIDIAN_1' ? 'text-red-400' : 'text-amber-300'
              }`}
            >
              ~ {card.fullName}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 px-2.5 py-2 rounded-md bg-black/45 border border-white/10">
        <div className="font-stat text-[11px] font-bold text-zinc-100 truncate">
          {card.statLine || 'Official MLB Pull'}
        </div>
        <div className="font-stat text-[9px] text-zinc-400 uppercase tracking-wider truncate mt-0.5">
          {card.gameMatchup ? `${card.gameMatchup} • ${card.sourceTag}` : card.sourceTag || card.series}
        </div>
      </div>

      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] font-stat text-zinc-400">
        <span className="truncate">{rarity.name}</span>
        {onExportPng && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExportPng(card, team);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-zinc-200 font-bold transition shrink-0"
            title="Save high-res trading card PNG"
          >
            <Download className="w-3 h-3" />
            <span>PNG</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function PackHub({
  vault,
  setVault,
  nowMs,
  freeAgents,
  transactions,
  liveGames,
  onBack,
  onOpenPlayer,
  onOpenBoxScore,
  TeamLogo,
  pendingReveal,
  setPendingReveal,
}) {
  const [rippingStage, setRippingStage] = useState('idle');
  const [revealData, setRevealData] = useState(null);
  const [packError, setPackError] = useState('');
  const [forcedRarity, setForcedRarity] = useState('REAL');
  const [rarityFilter, setRarityFilter] = useState('ALL');
  const [binderSearch, setBinderSearch] = useState('');
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState(vault.handle || 'collector');
  const [exporting, setExporting] = useState(false);

  const [selectedReplayDate, setSelectedReplayDate] = useState(CLASSIC_TEST_GAMES[0].date);
  const [replayGames, setReplayGames] = useState([]);
  const [loadingReplayGames, setLoadingReplayGames] = useState(false);
  const [rippingGamePk, setRippingGamePk] = useState(null);

  useEffect(() => {
    if (pendingReveal) {
      setRevealData(pendingReveal);
      setRippingStage('sealed');
      setPendingReveal(null);
    }
  }, [pendingReveal, setPendingReveal]);

  const cooldownMs = getCooldownRemainingMs(vault, nowMs);
  const packReady = cooldownMs <= 0;

  const hotStovePool = useMemo(
    () => buildHotStovePool(freeAgents, transactions),
    [freeAgents, transactions]
  );

  const pinnedCards = useMemo(
    () =>
      vault.pinnedIds
        .map((uid) => vault.cards.find((c) => c.uid === uid))
        .filter(Boolean),
    [vault.pinnedIds, vault.cards]
  );

  const numberedCount = useMemo(
    () => vault.cards.filter((c) => Boolean(c.serialCap)).length,
    [vault.cards]
  );

  const filteredBinder = useMemo(() => {
    const q = binderSearch.trim().toLowerCase();
    return vault.cards.filter((c) => {
      if (rarityFilter === 'NUMBERED' && !c.serialCap) return false;
      if (rarityFilter !== 'ALL' && rarityFilter !== 'NUMBERED' && c.rarityId !== rarityFilter) return false;
      if (q) {
        const hay = `${c.fullName} ${c.teamAbbr} ${c.position} ${c.sourceTag} ${c.statLine}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vault.cards, rarityFilter, binderSearch]);

  const handleRipHotStove = () => {
    setPackError('');
    const result = ripSinglePack({
      vault,
      pool: hotStovePool,
      packMode: 'HOT_STOVE',
      series: CURRENT_SERIES,
      forcedRarityId: vault.testMode && forcedRarity !== 'REAL' ? forcedRarity : null,
    });
    if (!result.ok) {
      setPackError(result.error);
      return;
    }
    setVault(result.vault);
    setRevealData({
      card: result.card,
      isDuplicate: result.isDuplicate,
      packTitle: '2026–27 Hot Stove Pack',
      packSubtitle: `Pulled from ${hotStovePool.length} active offseason players`,
    });
    setRippingStage('sealed');
  };

  const loadReplaySlate = async (dateStr) => {
    setSelectedReplayDate(dateStr);
    setLoadingReplayGames(true);
    setPackError('');
    try {
      const res = await fetch(`/api/season?type=scores&date=${encodeURIComponent(dateStr)}`);
      if (res.ok) {
        const data = await res.json();
        setReplayGames(Array.isArray(data?.games) ? data.games : []);
      } else {
        setReplayGames([]);
      }
    } catch {
      setReplayGames([]);
    } finally {
      setLoadingReplayGames(false);
    }
  };

  useEffect(() => {
    if ((!liveGames || liveGames.length === 0) && replayGames.length === 0) {
      loadReplaySlate(CLASSIC_TEST_GAMES[0].date);
    }
  }, []);

  const handleRipFromGame = async (game) => {
    if (!game?.gamePk) return;
    setPackError('');
    setRippingGamePk(game.gamePk);
    try {
      const res = await fetch(`/api/season?type=boxscore&gamePk=${encodeURIComponent(game.gamePk)}`);
      if (!res.ok) {
        setPackError('Could not load box score for this game.');
        return;
      }
      const boxData = await res.json();
      const pool = buildBoxScorePool(boxData);
      if (pool.length === 0) {
        setPackError('No players have appeared in this game box score yet.');
        return;
      }
      const result = ripSinglePack({
        vault,
        pool,
        packMode: 'GAME_CHECKIN',
        gamePk: game.gamePk,
        series: CURRENT_SERIES,
        forcedRarityId: vault.testMode && forcedRarity !== 'REAL' ? forcedRarity : null,
      });
      if (!result.ok) {
        setPackError(result.error);
        return;
      }
      setVault(result.vault);
      setRevealData({
        card: result.card,
        isDuplicate: result.isDuplicate,
        packTitle: `${boxData.away?.abbr || 'AWY'} @ ${boxData.home?.abbr || 'HME'} Game Pack`,
        packSubtitle: `Pulled from ${pool.length} players who appeared in this box score`,
      });
      setRippingStage('sealed');
    } catch {
      setPackError('Network error loading game box score.');
    } finally {
      setRippingGamePk(null);
    }
  };

  const togglePin = (uid) => {
    setVault((prev) => {
      const exists = prev.pinnedIds.includes(uid);
      if (exists) {
        return { ...prev, pinnedIds: prev.pinnedIds.filter((id) => id !== uid) };
      }
      if (prev.pinnedIds.length >= MAX_PINNED_CARDS) {
        setPackError(`Showcase is full (${MAX_PINNED_CARDS}/${MAX_PINNED_CARDS}). Unpin a card first.`);
        return prev;
      }
      setPackError('');
      return { ...prev, pinnedIds: [...prev.pinnedIds, uid] };
    });
  };

  const saveHandle = () => {
    const clean = handleDraft.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 20) || 'collector';
    setVault((prev) => ({ ...prev, handle: clean }));
    setHandleDraft(clean);
    setEditingHandle(false);
  };

  const displayedGames = liveGames && liveGames.length > 0 ? liveGames : replayGames;
  const usingReplayGames = !liveGames || liveGames.length === 0;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-sky-500" />
            <span>Back</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <Package className="w-5 h-5 text-sky-500" />
                <span>Packs &amp; Collector Binder</span>
              </h2>
              <span className="px-2 py-0.5 rounded font-stat text-[10px] font-bold uppercase bg-red-600/15 text-red-500">
                {CURRENT_SERIES}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              1 mystery player pack every 6 hours • Series-capped parallels (/99, /25, /10, 1/1) • Pin up to 6 to your showcase
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editingHandle ? (
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
              <span className="font-stat text-xs text-slate-400">@</span>
              <input
                type="text"
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveHandle()}
                className="w-28 bg-transparent text-xs font-bold focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={saveHandle}
                className="p-1 rounded bg-sky-600 text-white"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setHandleDraft(vault.handle || 'collector');
                setEditingHandle(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-stat font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
              title="Edit your collector handle"
            >
              <User className="w-3.5 h-3.5 text-sky-500" />
              <span>@{vault.handle || 'collector'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setVault((prev) => ({ ...prev, testMode: !prev.testMode }))
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              vault.testMode
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-500'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-200'
            }`}
            title="Enable Sandbox Test Mode to bypass the 6-hour timer and preview all rarities"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{vault.testMode ? 'Test Mode: ON' : 'Test Mode'}</span>
          </button>
        </div>
      </div>

      {/* Sandbox / Test Mode Toolbar */}
      {vault.testMode && (
        <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-stat font-extrabold uppercase text-[11px] text-amber-500">
              Sandbox Controls:
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              6-hour cooldown bypassed. Force rarity preview:
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'REAL', label: 'Real Odds' },
                { id: 'HOLO', label: 'Holo' },
                { id: 'CRIMSON_99', label: '/99' },
                { id: 'GOLD_25', label: '/25' },
                { id: 'SCRIPT_10', label: '/10 Script' },
                { id: 'OBSIDIAN_1', label: '1/1' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForcedRarity(opt.id)}
                  className={`px-2 py-1 rounded font-stat text-[11px] font-bold transition ${
                    forcedRarity === opt.id
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-white/70 dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-amber-500/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVault((prev) => ({ ...prev, lastPackAt: null, claimedGamePks: [] }))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-500/40 bg-white/60 dark:bg-zinc-900 font-bold text-[11px] hover:border-amber-400 transition"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Timer
            </button>
            <button
              type="button"
              onClick={() => {
                setVault((prev) => ({
                  ...prev,
                  cards: [],
                  pinnedIds: [],
                  claimedGamePks: [],
                  serialCounters: {},
                  totalPacksOpened: 0,
                  lastPackAt: null,
                }));
              }}
              className="px-2.5 py-1 rounded border border-rose-500/40 text-rose-500 font-bold text-[11px] hover:bg-rose-500/10 transition"
            >
              Clear Vault
            </button>
          </div>
        </div>
      )}

      {packError && (
        <div className="px-4 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-500 dark:text-red-400 flex items-center justify-between">
          <span>{packError}</span>
          <button type="button" onClick={() => setPackError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pack Ripping Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-stat text-[10px] font-extrabold uppercase tracking-wider bg-red-600/15 text-red-500">
                <Flame className="w-3 h-3" />
                Live Offseason Mode
              </span>
              <span className="font-stat text-[11px] font-bold text-slate-400">
                {hotStovePool.length} Players in Pool
              </span>
            </div>

            <div>
              <h3 className="text-lg font-black">2026–27 Hot Stove Pack</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Rip 1 mystery player card pulled directly from recent official MLB signings, trades, and the 2026–27 free-agent board.
              </p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-1.5 pt-1">
              {RARITY_TIERS.slice().reverse().map((r) => (
                <div
                  key={r.id}
                  className="px-2 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-center"
                >
                  <div className="font-stat text-[10px] font-extrabold text-slate-700 dark:text-zinc-200 truncate">
                    {r.shortLabel}
                  </div>
                  <div className="font-stat text-[10px] text-slate-400">{r.oddsLabel}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 font-stat text-xs">
              <Clock className={`w-4 h-4 ${packReady ? 'text-emerald-500' : 'text-slate-400'}`} />
              {packReady ? (
                <span className="font-bold text-emerald-500">
                  {vault.testMode ? 'Ready (Test Mode)' : 'Pack Ready Now'}
                </span>
              ) : (
                <span className="text-slate-400">
                  Next in <strong className="text-slate-800 dark:text-white">{formatCooldownShort(cooldownMs)}</strong>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleRipHotStove}
              disabled={!packReady}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-extrabold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-45 disabled:cursor-not-allowed transition"
            >
              <Package className="w-4 h-4" />
              <span>{packReady ? 'Rip Hot Stove Pack' : `Locked (${formatCooldownShort(cooldownMs)})`}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-stat text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-500">
                <Calendar className="w-3 h-3" />
                {usingReplayGames ? '2026 Classic Replay (Offseason Tester)' : 'Live MLB Game Check-In'}
              </span>
              <span className="font-stat text-[11px] text-slate-400">
                1 pull from that exact box score
              </span>
            </div>

            <div>
              <h3 className="text-lg font-black">Game Box-Score Pack</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {usingReplayGames
                  ? 'No live MLB games are scheduled in November—test the exact box-score pack engine right now using 2026 World Series & regular-season games.'
                  : 'Check into any live or final MLB game to pull 1 player who appeared in that box score, stamped with their game stat line.'}
              </p>
            </div>

            {usingReplayGames && (
              <div className="flex flex-wrap items-center gap-1.5">
                {CLASSIC_TEST_GAMES.map((g) => (
                  <button
                    key={g.date}
                    type="button"
                    onClick={() => loadReplaySlate(g.date)}
                    className={`px-2.5 py-1 rounded-md font-stat text-[11px] font-bold border transition ${
                      selectedReplayDate === g.date
                        ? 'border-red-500/60 bg-red-500/15 text-red-500 dark:text-red-400'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}

            {loadingReplayGames ? (
              <div className="py-6 text-center font-stat text-xs text-slate-400">
                Loading MLB box scores for {selectedReplayDate}...
              </div>
            ) : displayedGames.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No games found for this date. Pick another classic slate above.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {displayedGames.slice(0, 6).map((g) => {
                  const aw = getTeamInfo(g.away?.abbr);
                  const hm = getTeamInfo(g.home?.abbr);
                  const alreadyClaimed = !vault.testMode && vault.claimedGamePks.includes(String(g.gamePk));
                  const busy = rippingGamePk === g.gamePk;
                  return (
                    <div
                      key={g.gamePk}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenBoxScore && onOpenBoxScore(g.gamePk)}
                        className="text-left min-w-0 flex-1 group"
                        title="Open full box score"
                      >
                        <div className="flex items-center gap-1.5 font-stat text-xs font-extrabold">
                          {TeamLogo && <TeamLogo abbr={aw.abbr} size="xs" className="!w-4 !h-4" />}
                          <span>{aw.abbr} {g.away?.runs ?? ''}</span>
                          <span className="text-slate-400">@</span>
                          {TeamLogo && <TeamLogo abbr={hm.abbr} size="xs" className="!w-4 !h-4" />}
                          <span>{hm.abbr} {g.home?.runs ?? ''}</span>
                        </div>
                        <div className="text-[10px] font-stat text-slate-400 truncate mt-0.5 group-hover:text-sky-500">
                          {g.status || 'Final'} • View Box Score
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={!packReady || alreadyClaimed || busy}
                        onClick={() => handleRipFromGame(g)}
                        className="px-2.5 py-1.5 rounded-md font-stat text-[10px] font-extrabold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                      >
                        {busy ? 'Ripping...' : alreadyClaimed ? 'Claimed' : 'Rip Pack'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned Profile Showcase */}
      <section className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Pin className="w-4 h-4 text-sky-500" />
              <span>@{vault.handle || 'collector'} — Pinned Showcase ({pinnedCards.length}/{MAX_PINNED_CARDS})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pin your best numbered, foil, or game-stamped pulls to display at the top of your collector profile.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-stat text-[11px]">
              <span><strong>{vault.totalPacksOpened}</strong> Packs</span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span><strong>{vault.cards.length}</strong> Unique</span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="text-red-500"><strong>{numberedCount}</strong> Numbered</span>
            </div>

            <button
              type="button"
              disabled={pinnedCards.length === 0 || exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportShowcasePng(vault.handle, pinnedCards, getTeamInfo);
                } finally {
                  setExporting(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>{exporting ? 'Exporting...' : 'Save Showcase PNG'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Array.from({ length: MAX_PINNED_CARDS }).map((_, slotIdx) => {
            const card = pinnedCards[slotIdx];
            if (!card) {
              return (
                <div
                  key={`empty-${slotIdx}`}
                  className="min-h-[168px] rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col items-center justify-center gap-1.5 p-4 text-center"
                >
                  <Pin className="w-4 h-4 text-slate-400/70" />
                  <span className="font-stat text-[11px] font-bold text-slate-400">
                    Showcase Slot #{slotIdx + 1}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Click the pin icon on any card below
                  </span>
                </div>
              );
            }
            return (
              <CollectibleCard
                key={card.uid}
                card={card}
                isPinned
                onTogglePin={togglePin}
                onOpenPlayer={onOpenPlayer}
                onExportPng={exportPulledCardPng}
                TeamLogo={TeamLogo}
                compact
              />
            );
          })}
        </div>
      </section>

      {/* Full Binder */}
      <section className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-black flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-500" />
            <span>My Binder ({vault.cards.length})</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={binderSearch}
                onChange={(e) => setBinderSearch(e.target.value)}
                placeholder="Search player or team..."
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'NUMBERED', label: 'Numbered' },
                { id: 'OBSIDIAN_1', label: '1/1' },
                { id: 'SCRIPT_10', label: '/10' },
                { id: 'GOLD_25', label: '/25' },
                { id: 'CRIMSON_99', label: '/99' },
                { id: 'HOLO', label: 'Holo' },
                { id: 'BASE', label: 'Base' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRarityFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md font-stat text-[11px] font-bold transition ${
                    rarityFilter === f.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredBinder.length === 0 ? (
          <div className="py-12 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
            <Package className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-500">
              {vault.cards.length === 0
                ? 'Your binder is empty — rip your first Hot Stove or Game Box-Score pack above!'
                : 'No cards match this filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredBinder.map((card) => (
              <CollectibleCard
                key={card.uid}
                card={card}
                isPinned={vault.pinnedIds.includes(card.uid)}
                onTogglePin={togglePin}
                onOpenPlayer={onOpenPlayer}
                onExportPng={exportPulledCardPng}
                TeamLogo={TeamLogo}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pack Rip & Card Reveal Modal */}
      {rippingStage !== 'idle' && revealData && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            if (rippingStage === 'revealed') setRippingStage('idle');
          }}
        >
          <div
            className="w-full max-w-md space-y-4 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            {rippingStage === 'sealed' ? (
              <div className="text-center space-y-5">
                <div className="space-y-1">
                  <div className="font-stat text-[11px] font-bold uppercase tracking-widest text-red-400">
                    {revealData.packTitle}
                  </div>
                  <p className="text-xs text-zinc-400">{revealData.packSubtitle}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setRippingStage('revealed')}
                  className="mx-auto w-64 h-96 rounded-xl border-2 border-red-500/60 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-2xl flex flex-col items-center justify-between p-6 hover:scale-[1.03] active:scale-[0.98] transition-transform cursor-pointer hst-pack-pulse group relative overflow-hidden"
                >
                  <div className="w-full flex items-center justify-between font-stat text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-white/10 pb-2">
                    <span>HST SERIES</span>
                    <span className="text-red-400">1 CARD</span>
                  </div>

                  <div className="space-y-3 text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-red-600/20 border border-red-500/50 flex items-center justify-center">
                      <Package className="w-8 h-8 text-red-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="font-display font-black text-xl tracking-tight text-white">
                      HOT STOVE
                    </div>
                    <div className="font-stat text-[10px] text-zinc-400 uppercase tracking-widest">
                      {CURRENT_SERIES}
                    </div>
                  </div>

                  <div className="w-full py-2 rounded-md bg-white text-zinc-950 font-stat text-xs font-extrabold uppercase tracking-wider">
                    Tap to Rip Open
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-card-reveal">
                <div className="flex items-center justify-between text-white">
                  <div>
                    <div className="font-stat text-[11px] font-extrabold uppercase tracking-widest text-red-400">
                      {revealData.isDuplicate ? 'Duplicate Stacked!' : 'New Pull Added to Binder!'}
                    </div>
                    <div className="text-xs text-zinc-400">{revealData.packTitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRippingStage('idle')}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <CollectibleCard
                  card={revealData.card}
                  isPinned={vault.pinnedIds.includes(revealData.card.uid)}
                  onTogglePin={togglePin}
                  onOpenPlayer={(id, name, abbr) => {
                    setRippingStage('idle');
                    onOpenPlayer(id, name, abbr);
                  }}
                  onExportPng={exportPulledCardPng}
                  TeamLogo={TeamLogo}
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => togglePin(revealData.card.uid)}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold border border-white/15 bg-zinc-900 hover:border-red-500 text-white transition"
                  >
                    <Pin className="w-3.5 h-3.5 text-red-400" />
                    <span>
                      {vault.pinnedIds.includes(revealData.card.uid) ? 'Pinned to Showcase' : 'Pin to Showcase'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRippingStage('idle')}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-extrabold bg-white text-zinc-950 hover:bg-zinc-200 transition"
                  >
                    <span>Keep in Binder</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
