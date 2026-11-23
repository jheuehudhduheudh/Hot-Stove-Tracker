import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, Package, Sparkles, Pin, Download, Clock, RotateCcw,
  Search, Layers, Check, X, Flame, Calendar, User, Volume2, VolumeX, Zap
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

// =========================================================================
// ZERO-DEPENDENCY WEB AUDIO PACK SOUND SYNTHESIZER
// =========================================================================
function playPackSound(type, rarityRank = 1, muted = false) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'tear') {
      // Filtered white noise burst for foil pack tear
      const bufferSize = Math.floor(ctx.sampleRate * 0.28);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.4);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(4200, now + 0.24);
      filter.Q.value = 1.6;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);

      // Rising suspense hum for Holo+
      if (rarityRank >= 2) {
        const osc = ctx.createOscillator();
        const oGain = ctx.createGain();
        osc.type = rarityRank >= 5 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(110, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(rarityRank >= 5 ? 440 : 280, now + 0.72);
        oGain.gain.setValueAtTime(0.001, now + 0.08);
        oGain.gain.linearRampToValueAtTime(0.11, now + 0.55);
        oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
        osc.connect(oGain);
        oGain.connect(ctx.destination);
        osc.start(now + 0.08);
        osc.stop(now + 0.8);
      }
    } else if (type === 'reveal') {
      // Impact bass thump
      const bass = ctx.createOscillator();
      const bGain = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(rarityRank >= 4 ? 145 : 110, now);
      bass.frequency.exponentialRampToValueAtTime(38, now + 0.26);
      bGain.gain.setValueAtTime(rarityRank >= 4 ? 0.3 : 0.16, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      bass.connect(bGain);
      bGain.connect(ctx.destination);
      bass.start(now);
      bass.stop(now + 0.32);

      // Harmonic chord scaled by rarity
      const notes =
        rarityRank >= 6
          ? [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5] // 1/1 Obsidian grand fanfare
          : rarityRank >= 5
          ? [293.66, 369.99, 440.0, 587.33, 739.99, 880.0]          // /10 Gold Ink Script
          : rarityRank >= 4
          ? [329.63, 415.3, 493.88, 659.25, 830.61]                 // /25 Gold Foil
          : rarityRank >= 3
          ? [261.63, 329.63, 392.0, 523.25]                         // /99 Crimson Chrome
          : rarityRank >= 2
          ? [392.0, 493.88, 587.33]                                 // Holo Foil shimmer
          : [329.63, 392.0];                                        // Base clean pop

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = rarityRank >= 4 ? 'triangle' : 'sine';
        const t = now + idx * 0.055;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(rarityRank >= 4 ? 0.12 : 0.08, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + (rarityRank >= 4 ? 0.85 : 0.42));
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.9);
      });
    }

    setTimeout(() => {
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore audio errors on restricted devices
  }
}

const RARITY_FX = {
  OBSIDIAN_1: {
    beam: 'rgba(239, 68, 68, 0.95)',
    flash: 'rgba(239, 68, 68, 0.45)',
    banner: '1 OF 1 OBSIDIAN!',
    subBanner: 'ULTIMATE GRAIL PULL',
    particles: 56,
    colors: ['#ef4444', '#ffffff', '#f43f5e', '#fca5a5', '#18181b'],
    walkoutMs: 980,
  },
  SCRIPT_10: {
    beam: 'rgba(245, 158, 11, 0.95)',
    flash: 'rgba(251, 191, 36, 0.4)',
    banner: 'GOLD INK SCRIPT /10!',
    subBanner: 'SIGNATURE PARALLEL HIT',
    particles: 46,
    colors: ['#f59e0b', '#fef08a', '#ffffff', '#fbbf24', '#d97706'],
    walkoutMs: 920,
  },
  GOLD_25: {
    beam: 'rgba(234, 179, 8, 0.9)',
    flash: 'rgba(250, 204, 21, 0.34)',
    banner: 'GOLD FOIL /25!',
    subBanner: 'SHORT-PRINT NUMBERED HIT',
    particles: 38,
    colors: ['#facc15', '#fef08a', '#f59e0b', '#ffffff'],
    walkoutMs: 820,
  },
  CRIMSON_99: {
    beam: 'rgba(220, 38, 38, 0.9)',
    flash: 'rgba(239, 68, 68, 0.28)',
    banner: 'CRIMSON CHROME /99!',
    subBanner: 'NUMBERED PARALLEL PULL',
    particles: 30,
    colors: ['#dc2626', '#f87171', '#ffffff', '#fca5a5'],
    walkoutMs: 740,
  },
  HOLO: {
    beam: 'rgba(167, 139, 250, 0.9)',
    flash: 'rgba(167, 139, 250, 0.24)',
    banner: 'HOLO FOIL!',
    subBanner: 'PRISMATIC PARALLEL',
    particles: 22,
    colors: ['#a78bfa', '#38bdf8', '#f472b6', '#34d399', '#ffffff'],
    walkoutMs: 620,
  },
  BASE: {
    beam: 'rgba(244, 244, 245, 0.72)',
    flash: 'rgba(255, 255, 255, 0.14)',
    banner: '',
    subBanner: '',
    particles: 10,
    colors: ['#e4e4e7', '#a1a1aa', '#ffffff'],
    walkoutMs: 0,
  },
};

function generateBurstParticles(rarityId) {
  const fx = RARITY_FX[rarityId] || RARITY_FX.BASE;
  return Array.from({ length: fx.particles }, (_, i) => {
    const angle = (Math.PI * 2 * i) / fx.particles + (Math.random() - 0.5) * 0.4;
    const dist = 110 + Math.random() * 210;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 20;
    return {
      id: i,
      tx: `${tx.toFixed(0)}px`,
      ty: `${ty.toFixed(0)}px`,
      rot: `${Math.round((Math.random() - 0.5) * 520)}deg`,
      size: 5 + Math.floor(Math.random() * 7),
      color: fx.colors[i % fx.colors.length],
      isDiamond: i % 3 === 0,
      dur: `${(0.75 + Math.random() * 0.65).toFixed(2)}s`,
      delay: `${(Math.random() * 0.14).toFixed(2)}s`,
    };
  });
}

function splitPlayerName(fullName) {
  const parts = String(fullName || 'MLB Player').trim().split(/\s+/);
  if (parts.length <= 1) return { first: '', last: parts[0] || 'PLAYER' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// =========================================================================
// TRUE VERTICAL 3D TRADING CARD COMPONENT (2.5 x 3.5 Baseball Card Ratio)
// =========================================================================
function TradingCard({
  card,
  isPinned,
  onTogglePin,
  onOpenPlayer,
  onExportPng,
  TeamLogo,
  size = 'grid', // 'hero' | 'grid'
}) {
  const [imgStage, setImgStage] = useState(0); // 0: transparent vertical cutout, 1: MLB spot headshot, 2: initials
  const cardRef = useRef(null);

  useEffect(() => {
    setImgStage(0);
  }, [card?.playerId]);

  const rarity = RARITY_BY_ID[card.rarityId] || RARITY_BY_ID.BASE;
  const team = getTeamInfo(card.teamAbbr);
  const { first, last } = splitPlayerName(card.fullName);
  const isHero = size === 'hero';
  const hasScript = card.rarityId === 'SCRIPT_10' || card.rarityId === 'OBSIDIAN_1';

  const serialText = card.serialCap
    ? `#${String(card.serialNumber || 1).padStart(card.serialCap >= 100 ? 3 : 2, '0')}/${card.serialCap}`
    : rarity.shortLabel;

  const initials = (card.fullName || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const imgUrl =
    imgStage === 0 && card.playerId
      ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${card.playerId}/headshot/67/current`
      : imgStage === 1 && card.playerId
      ? `https://midfield.mlbstatic.com/v1/people/${card.playerId}/spots/213`
      : null;

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const maxTilt = isHero ? 15 : 10;
    const rotY = (x - 0.5) * maxTilt * 2;
    const rotX = (0.5 - y) * maxTilt * 2;
    el.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${isHero ? 1.02 : 1.03})`;
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--glare-opacity', '1');
  };

  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
    el.style.setProperty('--glare-opacity', '0');
  };

  return (
    <div className="hst-card-stage w-full">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`hst-tcg-card hst-tier-${card.rarityId || 'BASE'} relative w-full aspect-[2.5/3.5] rounded-2xl overflow-hidden select-none flex flex-col justify-between`}
      >
        {/* Dynamic Holographic Foil & Specular Glare */}
        <div className="hst-tcg-foil" />
        <div className="hst-tcg-glare" />

        {/* Team-Colored Radial Stadium Spotlight Behind Player */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 38%, ${team.color}99 0%, ${team.color}28 42%, transparent 72%)`,
          }}
        />

        {/* Diagonal Graphic Stripe Texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-32deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 14px)',
          }}
        />

        {/* Inner Architectural Trading Card Frame */}
        <div className="pointer-events-none absolute inset-2 rounded-xl border border-white/15 z-20" />

        {/* Oversized Background Team Abbr Watermark */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-[14%] text-center font-display font-black tracking-tighter text-white/[0.08] leading-none z-0 ${
            isHero ? 'text-[128px]' : 'text-[76px]'
          }`}
        >
          {team.abbr}
        </div>

        {/* TOP BAR: Team Logo + Position (Left) & Serial/Rarity Foil Plate (Right) */}
        <div className={`relative z-30 flex items-start justify-between gap-1.5 ${isHero ? 'p-4 pb-0' : 'p-2.5 pb-0'}`}>
          <div className="flex items-center gap-1.5">
            <div
              className={`${isHero ? 'w-9 h-9' : 'w-6 h-6'} rounded-lg bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center p-1 shadow-md`}
            >
              {TeamLogo && <TeamLogo abbr={team.abbr} size="xs" className="w-full h-full" />}
            </div>
            <div className="leading-tight">
              <div className={`font-stat font-extrabold text-white drop-shadow ${isHero ? 'text-xs' : 'text-[9px]'}`}>
                {team.abbr}
              </div>
              <div className={`font-stat font-bold text-white/65 ${isHero ? 'text-[10px]' : 'text-[8px]'}`}>
                {card.position || 'MLB'}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2 py-0.5 rounded-md font-stat font-black uppercase tracking-wider shadow-md backdrop-blur-sm ${
                rarity.badgeClass
              } ${isHero ? 'text-[11px]' : 'text-[9px]'}`}
            >
              {serialText}
            </span>
            {card.copies > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-black/70 border border-white/15 font-stat text-[9px] font-bold text-zinc-200">
                ×{card.copies}
              </span>
            )}
          </div>
        </div>

        {/* CENTER ARTWORK: Large Upper-Body Player Cutout Portrait */}
        <div
          onClick={() => onOpenPlayer && onOpenPlayer(card.playerId, card.fullName, card.teamAbbr)}
          className="relative z-10 flex-1 flex items-end justify-center overflow-hidden cursor-pointer -mt-2"
          title="View full MLB player profile"
        >
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={card.fullName}
              onError={() => setImgStage((s) => s + 1)}
              className={`object-contain object-bottom drop-shadow-[0_14px_24px_rgba(0,0,0,0.85)] transition-transform duration-300 ${
                imgStage === 1
                  ? isHero
                    ? 'w-44 h-44 rounded-full object-cover mb-5 border-2 border-white/30'
                    : 'w-24 h-24 rounded-full object-cover mb-3 border-2 border-white/25'
                  : 'h-[106%] w-auto max-w-[92%]'
              }`}
            />
          ) : (
            <div
              className={`${isHero ? 'w-32 h-32 text-4xl mb-6' : 'w-20 h-20 text-2xl mb-3'} rounded-full flex items-center justify-center font-display font-black text-white border-2 border-white/30 shadow-xl`}
              style={{ backgroundColor: team.color }}
            >
              {initials}
            </div>
          )}

          {/* Gold / Crimson Script Signature Overlay for /10 and 1/1 */}
          {hasScript && (
            <div
              className={`pointer-events-none absolute inset-x-3 bottom-2 text-center font-serif italic font-bold -rotate-6 drop-shadow-[0_3px_8px_rgba(0,0,0,0.95)] truncate z-30 ${
                card.rarityId === 'OBSIDIAN_1' ? 'text-red-400' : 'text-amber-300'
              } ${isHero ? 'text-2xl' : 'text-sm'}`}
            >
              {card.fullName}
            </div>
          )}

          {/* Smooth Dark Fade into Nameplate */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#09090b] via-[#09090b]/75 to-transparent z-20" />
        </div>

        {/* BOTTOM NAMEPLATE & STAT TICKER */}
        <div className={`relative z-30 bg-gradient-to-b from-[#09090b]/95 to-[#060608] border-t border-white/15 ${isHero ? 'px-4 pt-3 pb-3.5' : 'px-2.5 pt-2 pb-2.5'}`}>
          {/* Team Accent Stripe on Top of Nameplate */}
          <div
            className="absolute top-0 left-3 right-3 h-[2px] -translate-y-[1px] rounded-full"
            style={{ backgroundColor: rarity.rank >= 3 ? rarity.accent : team.color }}
          />

          <div
            onClick={() => onOpenPlayer && onOpenPlayer(card.playerId, card.fullName, card.teamAbbr)}
            className="cursor-pointer group text-center"
          >
            {first && (
              <div
                className={`font-stat font-bold uppercase tracking-[0.22em] text-zinc-400 truncate ${
                  isHero ? 'text-[10px]' : 'text-[8px]'
                }`}
              >
                {first}
              </div>
            )}
            <div
              className={`font-display font-black uppercase tracking-tight text-white group-hover:text-red-400 transition-colors truncate leading-none mt-0.5 ${
                isHero ? 'text-2xl' : 'text-sm'
              }`}
            >
              {last}
            </div>
          </div>

          {/* Sleek Compact Stat Pill */}
          <div
            className={`mt-2 rounded-md bg-white/[0.06] border border-white/10 text-center truncate font-stat font-bold text-zinc-200 ${
              isHero ? 'px-2.5 py-1.5 text-[11px]' : 'px-1.5 py-1 text-[9px]'
            }`}
          >
            {card.statLine || 'Official MLB Pull'}
          </div>

          {/* Series / Matchup Stamp & Action Icons */}
          <div className="mt-2 flex items-center justify-between gap-1">
            <span
              className={`font-stat font-bold uppercase tracking-wider text-zinc-400 truncate ${
                isHero ? 'text-[9px]' : 'text-[8px]'
              }`}
            >
              {card.gameMatchup || card.sourceTag || card.series}
            </span>

            {!isHero && (
              <div className="flex items-center gap-1 shrink-0">
                {onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(card.uid);
                    }}
                    title={isPinned ? 'Unpin from Showcase' : 'Pin to Showcase'}
                    className={`p-1 rounded border transition ${
                      isPinned
                        ? 'bg-red-600/25 border-red-500/60 text-red-400'
                        : 'border-white/15 bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Pin className={`w-2.5 h-2.5 ${isPinned ? 'fill-current' : ''}`} />
                  </button>
                )}
                {onExportPng && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportPng(card, team);
                    }}
                    title="Download Trading Card PNG"
                    className="p-1 rounded border border-white/15 bg-white/5 text-zinc-300 hover:bg-white/15 hover:text-white transition"
                  >
                    <Download className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// MAIN PACK HUB COMPONENT
// =========================================================================
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
  // Cinematic reveal stages: 'idle' | 'sealed' | 'tearing' | 'walkout' | 'revealed'
  const [rippingStage, setRippingStage] = useState('idle');
  const [revealData, setRevealData] = useState(null);
  const [burstParticles, setBurstParticles] = useState([]);
  const [soundMuted, setSoundMuted] = useState(false);

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

  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (pendingReveal) {
      clearTimers();
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

  const startSealedPack = (data) => {
    clearTimers();
    setRevealData(data);
    setBurstParticles([]);
    setRippingStage('sealed');
  };

  // Multi-Stage Pack Tear -> Walkout Hit Flash -> 3D Card Reveal + Particle Burst
  const triggerRipAnimation = () => {
    if (!revealData || rippingStage !== 'sealed') return;
    clearTimers();

    const rarity = RARITY_BY_ID[revealData.card?.rarityId] || RARITY_BY_ID.BASE;
    const fx = RARITY_FX[rarity.id] || RARITY_FX.BASE;

    playPackSound('tear', rarity.rank, soundMuted);
    setRippingStage('tearing');

    const tearMs = 740;
    if (fx.walkoutMs > 0) {
      const t1 = setTimeout(() => {
        setRippingStage('walkout');
        playPackSound('reveal', rarity.rank, soundMuted);
      }, tearMs);

      const t2 = setTimeout(() => {
        setBurstParticles(generateBurstParticles(rarity.id));
        setRippingStage('revealed');
      }, tearMs + fx.walkoutMs);

      timersRef.current.push(t1, t2);
    } else {
      const t1 = setTimeout(() => {
        playPackSound('reveal', rarity.rank, soundMuted);
        setBurstParticles(generateBurstParticles(rarity.id));
        setRippingStage('revealed');
      }, tearMs);
      timersRef.current.push(t1);
    }
  };

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
    startSealedPack({
      card: result.card,
      isDuplicate: result.isDuplicate,
      packTitle: '2026–27 Hot Stove Pack',
      packSubtitle: `Pulled from ${hotStovePool.length} active offseason players`,
    });
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
      startSealedPack({
        card: result.card,
        isDuplicate: result.isDuplicate,
        packTitle: `${boxData.away?.abbr || 'AWY'} @ ${boxData.home?.abbr || 'HME'} Game Pack`,
        packSubtitle: `Pulled from ${pool.length} players who appeared in this box score`,
      });
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

  const revealRarity = revealData?.card ? RARITY_BY_ID[revealData.card.rarityId] || RARITY_BY_ID.BASE : RARITY_BY_ID.BASE;
  const revealFx = RARITY_FX[revealRarity.id] || RARITY_FX.BASE;
  const revealTeam = revealData?.card ? getTeamInfo(revealData.card.teamAbbr) : getTeamInfo('MLB');

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
              1 mystery player pack every 6 hours • Interactive 3D foil cards • Series-capped parallels (/99, /25, /10, 1/1)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundMuted((m) => !m)}
            title={soundMuted ? 'Unmute pack sound FX' : 'Mute pack sound FX'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-sky-500" />}
          </button>

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
            title="Enable Sandbox Test Mode to bypass the 6-hour timer and preview every hit animation"
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
              Preview rarity walkouts:
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
                Rip 1 mystery trading card pulled from official MLB signings, trades, and the 2026–27 free-agent board.
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
                  ? 'No live MLB games are scheduled right now—test the box-score pack engine using 2026 World Series & regular-season games.'
                  : 'Check into any live or final MLB game to pull 1 player who appeared in that box score, stamped with their exact stat line.'}
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

      {/* Pinned Profile Showcase (6-Card Vertical Trophy Display Case) */}
      <section className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Pin className="w-4 h-4 text-sky-500" />
              <span>@{vault.handle || 'collector'} — Pinned Showcase ({pinnedCards.length}/{MAX_PINNED_CARDS})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hover any card to tilt the foil • Pin up to 6 pulls to display in your collector trophy shelf.
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {Array.from({ length: MAX_PINNED_CARDS }).map((_, slotIdx) => {
            const card = pinnedCards[slotIdx];
            if (!card) {
              return (
                <div
                  key={`empty-${slotIdx}`}
                  className="aspect-[2.5/3.5] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col items-center justify-center gap-1.5 p-4 text-center"
                >
                  <Pin className="w-4 h-4 text-slate-400/70" />
                  <span className="font-stat text-[10px] font-bold text-slate-400 uppercase">
                    Slot #{slotIdx + 1}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-snug">
                    Pin any card below
                  </span>
                </div>
              );
            }
            return (
              <TradingCard
                key={card.uid}
                card={card}
                isPinned
                onTogglePin={togglePin}
                onOpenPlayer={onOpenPlayer}
                onExportPng={exportPulledCardPng}
                TeamLogo={TeamLogo}
                size="grid"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredBinder.map((card) => (
              <TradingCard
                key={card.uid}
                card={card}
                isPinned={vault.pinnedIds.includes(card.uid)}
                onTogglePin={togglePin}
                onOpenPlayer={onOpenPlayer}
                onExportPng={exportPulledCardPng}
                TeamLogo={TeamLogo}
                size="grid"
              />
            ))}
          </div>
        )}
      </section>

      {/* =================================================================
          CINEMATIC PACK-RIPPING THEATER MODAL
          ================================================================= */}
      {rippingStage !== 'idle' && revealData && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-lg flex items-center justify-center p-4 overflow-hidden"
          onClick={() => {
            if (rippingStage === 'revealed') {
              clearTimers();
              setRippingStage('idle');
            }
          }}
        >
          {/* Ambient Rarity Radial Glow Behind Stage */}
          {(rippingStage === 'tearing' || rippingStage === 'walkout' || rippingStage === 'revealed') && (
            <div
              className="pointer-events-none fixed inset-0 transition-opacity duration-500"
              style={{
                background: `radial-gradient(circle at 50% 48%, ${revealFx.flash} 0%, transparent 62%)`,
              }}
            />
          )}

          {/* Full-Screen Flash on Walkout / Reveal */}
          {(rippingStage === 'walkout' || (rippingStage === 'revealed' && revealRarity.rank >= 2)) && (
            <div
              key={`flash-${rippingStage}`}
              className="pointer-events-none fixed inset-0 animate-screen-flash"
              style={{ backgroundColor: revealFx.flash }}
            />
          )}

          <div
            className="relative w-full max-w-sm flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* STAGE 1 & 2: SEALED FOIL PACK -> RIP & TEAR */}
            {(rippingStage === 'sealed' || rippingStage === 'tearing') && (
              <div className="text-center space-y-5 w-full flex flex-col items-center">
                <div className="space-y-1">
                  <div className="font-stat text-[11px] font-extrabold uppercase tracking-[0.22em] text-red-400">
                    {revealData.packTitle}
                  </div>
                  <p className="text-xs text-zinc-400">{revealData.packSubtitle}</p>
                </div>

                {/* Interactive Realistic Foil Wrapper */}
                <div className={`relative w-[276px] ${rippingStage === 'tearing' ? 'animate-pack-shake' : ''}`}>
                  {/* Rarity Light Beam Blasting Out When Tearing */}
                  {rippingStage === 'tearing' && (
                    <>
                      <div
                        className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 w-56 h-24 rounded-full blur-2xl animate-light-burst z-30"
                        style={{ backgroundColor: revealFx.beam }}
                      />
                      <div
                        className="pointer-events-none absolute top-4 left-4 right-4 h-2 rounded-full blur-sm z-30"
                        style={{ backgroundColor: revealFx.beam }}
                      />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={triggerRipAnimation}
                    disabled={rippingStage !== 'sealed'}
                    className="w-full text-left group focus:outline-none cursor-pointer"
                  >
                    {/* TOP FOIL TEAR STRIP (physically detaches & flies off on tear!) */}
                    <div
                      className={`relative z-20 rounded-t-xl overflow-hidden border-x-2 border-t-2 border-white/25 bg-zinc-900 ${
                        rippingStage === 'tearing' ? 'animate-top-rip' : 'group-hover:-translate-y-0.5 transition-transform'
                      }`}
                    >
                      <div className="h-4 hst-pack-crimp border-b border-white/15" />
                      <div className="px-4 py-2 bg-gradient-to-r from-red-700 via-red-600 to-red-700 flex items-center justify-between font-stat text-[10px] font-black uppercase tracking-widest text-white">
                        <span>← TEAR HERE</span>
                        <span>1 MYSTERY CARD</span>
                      </div>
                    </div>

                    {/* Dashed Tear Seam */}
                    <div className="h-[2px] border-t border-dashed border-white/40 bg-black" />

                    {/* MAIN FOIL PACK BODY */}
                    <div className="relative rounded-b-xl overflow-hidden border-x-2 border-b-2 border-white/20 hst-pack-wrapper h-[356px] flex flex-col items-center justify-between p-5">
                      <div className="pointer-events-none absolute inset-0 hst-pack-sheen" />

                      {/* Diagonal Metallic Stripes */}
                      <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(-40deg, transparent 0px, transparent 16px, rgba(220,38,38,0.4) 16px, rgba(220,38,38,0.4) 18px)',
                        }}
                      />

                      <div className="relative z-10 w-full flex items-center justify-between font-stat text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <span>SERIES 01</span>
                        <span className="text-red-400">2026–27</span>
                      </div>

                      {/* Center Foil Crest */}
                      <div className="relative z-10 text-center space-y-3 my-auto">
                        <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-red-600 via-red-700 to-zinc-950 p-[2px] shadow-[0_0_32px_rgba(220,38,38,0.5)] group-hover:scale-105 transition-transform">
                          <div className="w-full h-full rounded-full bg-zinc-950/90 flex flex-col items-center justify-center border border-white/15">
                            <Flame className="w-8 h-8 text-red-500" />
                            <span className="font-stat text-[8px] font-black tracking-widest text-zinc-300 mt-0.5">
                              HOBBY
                            </span>
                          </div>
                        </div>

                        <div>
                          <div className="font-display font-black text-2xl tracking-tight text-white">
                            HOT STOVE
                          </div>
                          <div className="font-stat text-[10px] font-bold uppercase tracking-[0.26em] text-red-400 mt-0.5">
                            CHROME EDITION
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-stat text-[9px] text-zinc-300">
                          <span>HOLO</span>
                          <span>•</span>
                          <span>/99</span>
                          <span>•</span>
                          <span>/25</span>
                          <span>•</span>
                          <span className="text-amber-300">/10</span>
                          <span>•</span>
                          <span className="text-red-400 font-black">1/1</span>
                        </div>
                      </div>

                      <div className="relative z-10 w-full space-y-2.5">
                        <div className="w-full py-2.5 rounded-lg bg-white text-zinc-950 font-stat text-xs font-black uppercase tracking-widest text-center shadow-lg group-hover:bg-red-500 group-hover:text-white transition-colors">
                          {rippingStage === 'tearing' ? 'RIPPING...' : 'TAP TO RIP PACK'}
                        </div>
                      </div>

                      {/* Bottom Foil Crimp */}
                      <div className="absolute inset-x-0 bottom-0 h-3.5 hst-pack-crimp border-t border-white/15" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 3: WALKOUT HIT BANNER (For Holo / /99 / /25 / /10 / 1/1!) */}
            {rippingStage === 'walkout' && (
              <div className="py-20 text-center space-y-4 animate-walkout-slam select-none">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-black/70 border-2 border-white/25 flex items-center justify-center p-3 shadow-2xl">
                  {TeamLogo && <TeamLogo abbr={revealTeam.abbr} size="lg" className="w-full h-full" />}
                </div>
                <div className="font-stat text-xs font-black uppercase tracking-[0.35em] text-white/80">
                  {revealFx.subBanner}
                </div>
                <div
                  className="font-display font-black text-3xl sm:text-4xl uppercase tracking-wider drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]"
                  style={{ color: revealRarity.accent }}
                >
                  {revealFx.banner}
                </div>
                <div className="font-stat text-xs font-bold uppercase tracking-widest text-zinc-300">
                  {revealTeam.name} • {revealData.card.position}
                </div>
              </div>
            )}

            {/* STAGE 4: 3D CARD LAUNCH REVEAL + PARTICLE EXPLOSION */}
            {rippingStage === 'revealed' && (
              <div className="w-full space-y-4 relative">
                {/* Confetti / Foil Sparkle Particle Burst Behind Card */}
                <div className="pointer-events-none absolute left-1/2 top-[44%] z-0">
                  {burstParticles.map((p) => (
                    <span
                      key={p.id}
                      className="absolute animate-particle-fly"
                      style={{
                        width: `${p.size}px`,
                        height: `${p.isDiamond ? p.size : p.size * 1.6}px`,
                        backgroundColor: p.color,
                        borderRadius: p.isDiamond ? '2px' : '9999px',
                        boxShadow: `0 0 10px ${p.color}`,
                        '--tx': p.tx,
                        '--ty': p.ty,
                        '--rot': p.rot,
                        '--dur': p.dur,
                        '--delay': p.delay,
                      }}
                    />
                  ))}
                </div>

                {/* Top Reveal Header */}
                <div className="relative z-20 flex items-center justify-between text-white">
                  <div>
                    <div
                      className="font-stat text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
                      style={{ color: revealRarity.rank >= 2 ? revealRarity.accent : '#f87171' }}
                    >
                      {revealRarity.rank >= 3 && <Zap className="w-3.5 h-3.5 fill-current" />}
                      <span>
                        {revealRarity.rank >= 2
                          ? `${revealRarity.name} HIT!`
                          : revealData.isDuplicate
                          ? 'Duplicate Stacked!'
                          : 'New Pull Added!'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Move cursor over card to tilt foil • {revealData.packTitle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearTimers();
                      setRippingStage('idle');
                    }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Hero 3D Vertical Trading Card */}
                <div className="relative z-20 mx-auto max-w-[320px] animate-card-launch">
                  <TradingCard
                    card={revealData.card}
                    isPinned={vault.pinnedIds.includes(revealData.card.uid)}
                    onTogglePin={togglePin}
                    onOpenPlayer={(id, name, abbr) => {
                      clearTimers();
                      setRippingStage('idle');
                      onOpenPlayer(id, name, abbr);
                    }}
                    onExportPng={exportPulledCardPng}
                    TeamLogo={TeamLogo}
                    size="hero"
                  />
                </div>

                {/* Reveal Action Buttons */}
                <div className="relative z-20 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => togglePin(revealData.card.uid)}
                    className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold border transition ${
                      vault.pinnedIds.includes(revealData.card.uid)
                        ? 'border-red-500/70 bg-red-600/20 text-red-300'
                        : 'border-white/15 bg-zinc-900 hover:border-red-500 text-white'
                    }`}
                  >
                    <Pin className={`w-3.5 h-3.5 ${vault.pinnedIds.includes(revealData.card.uid) ? 'fill-current' : ''}`} />
                    <span>{vault.pinnedIds.includes(revealData.card.uid) ? 'Pinned' : 'Pin'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportPulledCardPng(revealData.card, revealTeam)}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold border border-white/15 bg-zinc-900 hover:border-white/40 text-white transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save PNG</span>
                  </button>

                  {vault.testMode ? (
                    <button
                      type="button"
                      onClick={handleRipHotStove}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-extrabold bg-amber-500 text-zinc-950 hover:bg-amber-400 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Rip Again</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        clearTimers();
                        setRippingStage('idle');
                      }}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-extrabold bg-white text-zinc-950 hover:bg-zinc-200 transition"
                    >
                      <span>Keep</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
