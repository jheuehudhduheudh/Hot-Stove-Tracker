import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Package, Sparkles, Pin, Download, Clock, RotateCcw,
  Search, Layers, Check, X, Flame, Calendar, User, Volume2, VolumeX,
  ChevronDown, Share
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
// ZERO-DEPENDENCY WEB AUDIO PACK SOUND SYNTHESIZER (Triumph-Inspired Audio)
// =========================================================================
function playPackSound(type, payload = 1, muted = false) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'select') {
      // Crisp metallic latch + whoosh
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.16);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'fireworks') {
      // Shimmering fireworks crackle + rising energy hum
      const bufferSize = Math.floor(ctx.sampleRate * 0.45);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1800;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.14, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(ctx.destination);
      noise.start(now);

      const hum = ctx.createOscillator();
      const hg = ctx.createGain();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(140, now);
      hum.frequency.exponentialRampToValueAtTime(420, now + 0.75);
      hg.gain.setValueAtTime(0.001, now);
      hg.gain.linearRampToValueAtTime(0.1, now + 0.55);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      hum.connect(hg);
      hg.connect(ctx.destination);
      hum.start(now);
      hum.stop(now + 0.82);
    } else if (type === 'tick') {
      // Crisp roulette color-cycle tick
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const freq = 340 + (Number(payload) || 0) * 35;
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'lock') {
      // Dramatic rarity lock chime before card flip
      const rank = Number(payload) || 1;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = rank >= 4 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(rank >= 4 ? 523.25 : 392.0, now);
      osc.frequency.exponentialRampToValueAtTime(rank >= 4 ? 783.99 : 493.88, now + 0.25);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (type === 'reveal') {
      const rank = Number(payload) || 1;
      const bass = ctx.createOscillator();
      const bGain = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(rank >= 4 ? 150 : 115, now);
      bass.frequency.exponentialRampToValueAtTime(38, now + 0.28);
      bGain.gain.setValueAtTime(rank >= 4 ? 0.3 : 0.16, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      bass.connect(bGain);
      bGain.connect(ctx.destination);
      bass.start(now);
      bass.stop(now + 0.34);

      const notes =
        rank >= 6
          ? [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]
          : rank >= 5
          ? [293.66, 369.99, 440.0, 587.33, 739.99, 880.0]
          : rank >= 4
          ? [329.63, 415.3, 493.88, 659.25, 830.61]
          : rank >= 3
          ? [261.63, 329.63, 392.0, 523.25]
          : rank >= 2
          ? [392.0, 493.88, 587.33]
          : [329.63, 392.0];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = rank >= 4 ? 'triangle' : 'sine';
        const t = now + idx * 0.05;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(rank >= 4 ? 0.13 : 0.08, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + (rank >= 4 ? 0.88 : 0.44));
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.92);
      });
    }

    setTimeout(() => {
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore audio errors
  }
}

// Rarity visual profiles for the Triumph Color-Cycling Spin & Ticket-Stub Card
const TICKET_THEME = {
  OBSIDIAN_1: {
    ribbonLabel: '1 OF 1',
    ribbonBg: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)',
    ribbonText: '#ffffff',
    spinBg: '#dc2626',
    spinGlow: 'rgba(239, 68, 68, 0.95)',
    spinLabel: 'OBSIDIAN 1/1',
    backdrop: 'radial-gradient(circle at 50% 35%, #5c0c16 0%, #1d0509 55%, #070405 100%)',
    headlineColor: '#fca5a5',
    notchBorder: '#ef4444',
    heroNotchBg: '#26070d',
    heroNotchBg: '#1b0509',
    particles: 56,
    sparkColors: ['#ef4444', '#ffffff', '#fca5a5', '#f59e0b'],
  },
  SCRIPT_10: {
    ribbonLabel: 'SCRIPT',
    ribbonBg: 'linear-gradient(135deg, #fde68a 0%, #d97706 100%)',
    ribbonText: '#1c1204',
    spinBg: '#f59e0b',
    spinGlow: 'rgba(245, 158, 11, 0.95)',
    spinLabel: 'GOLD INK SCRIPT /10',
    backdrop: 'radial-gradient(circle at 50% 35%, #5e3809 0%, #241404 55%, #090603 100%)',
    headlineColor: '#fde68a',
    notchBorder: '#fbbf24',
    heroNotchBg: '#231404',
    particles: 48,
    sparkColors: ['#fbbf24', '#fef08a', '#ffffff', '#f59e0b'],
  },
  GOLD_25: {
    ribbonLabel: 'GOLD',
    ribbonBg: 'linear-gradient(135deg, #f7e6b2 0%, #c8a24a 100%)',
    ribbonText: '#1c1506',
    spinBg: '#eab308',
    spinGlow: 'rgba(250, 204, 21, 0.92)',
    spinLabel: 'GOLD FOIL /25',
    backdrop: 'radial-gradient(circle at 50% 35%, #5a1822 0%, #2b0b12 55%, #0d0507 100%)',
    headlineColor: '#f5df98',
    notchBorder: '#ead28f',
    heroNotchBg: '#2a0b12',
    particles: 40,
    sparkColors: ['#facc15', '#fef08a', '#ffffff', '#eab308'],
  },
  CRIMSON_99: {
    ribbonLabel: 'CRIMSON',
    ribbonBg: 'linear-gradient(135deg, #f87171 0%, #b91c1c 100%)',
    ribbonText: '#ffffff',
    spinBg: '#e11d48',
    spinGlow: 'rgba(225, 29, 72, 0.9)',
    spinLabel: 'CRIMSON CHROME /99',
    backdrop: 'radial-gradient(circle at 50% 35%, #63111d 0%, #26070d 55%, #0b0406 100%)',
    headlineColor: '#fecaca',
    notchBorder: '#ef4444',
    particles: 34,
    sparkColors: ['#ef4444', '#f87171', '#ffffff', '#fca5a5'],
  },
  HOLO: {
    ribbonLabel: 'HOLO',
    ribbonBg: 'linear-gradient(135deg, #e9d5ff 0%, #7c3aed 100%)',
    ribbonText: '#ffffff',
    spinBg: '#8b5cf6',
    spinGlow: 'rgba(167, 139, 250, 0.9)',
    spinLabel: 'HOLO FOIL',
    backdrop: 'radial-gradient(circle at 50% 35%, #371b63 0%, #160c29 55%, #08050f 100%)',
    headlineColor: '#e9d5ff',
    notchBorder: '#c4b5fd',
    heroNotchBg: '#170c2a',
    particles: 28,
    sparkColors: ['#a78bfa', '#38bdf8', '#f472b6', '#34d399', '#ffffff'],
  },
  BASE: {
    ribbonLabel: 'BASE',
    ribbonBg: 'linear-gradient(135deg, #d4d4d8 0%, #71717a 100%)',
    ribbonText: '#09090b',
    spinBg: '#64748b',
    spinGlow: 'rgba(148, 163, 184, 0.78)',
    spinLabel: 'BASE SERIES',
    backdrop: 'radial-gradient(circle at 50% 35%, #27272f 0%, #121216 55%, #070709 100%)',
    headlineColor: '#f4f4f5',
    notchBorder: '#71717a',
    heroNotchBg: '#121216',
    particles: 16,
    sparkColors: ['#e4e4e7', '#a1a1aa', '#ffffff'],
  },
};

// Palette cycled during the Triumph roulette card spin
const ROULETTE_CYCLE_COLORS = [
  { bg: '#64748b', glow: 'rgba(148,163,184,0.8)', label: 'BASE' },
  { bg: '#22c55e', glow: 'rgba(34,197,94,0.85)', label: 'UNCOMMON' },
  { bg: '#8b5cf6', glow: 'rgba(167,139,250,0.9)', label: 'HOLO FOIL' },
  { bg: '#e11d48', glow: 'rgba(239,68,68,0.92)', label: 'CRIMSON /99' },
  { bg: '#eab308', glow: 'rgba(250,204,21,0.95)', label: 'GOLD /25' },
  { bg: '#f59e0b', glow: 'rgba(245,158,11,0.95)', label: 'SCRIPT /10' },
  { bg: '#dc2626', glow: 'rgba(239,68,68,1)', label: 'OBSIDIAN 1/1' },
];

const AMBIENT_SPARKLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${((i * 37 + 11) % 94) + 3}%`,
  top: `${((i * 53 + 7) % 92) + 4}%`,
  size: (i % 3) * 2 + 3,
  dur: `${2.2 + (i % 5) * 0.65}s`,
  delay: `${(i % 7) * 0.35}s`,
}));

function generateFireworkBurst(count = 42, colors = ['#facc15', '#ffffff', '#f59e0b']) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const dist = 120 + Math.random() * 240;
    return {
      id: i,
      tx: `${(Math.cos(angle) * dist).toFixed(0)}px`,
      ty: `${(Math.sin(angle) * dist - 18).toFixed(0)}px`,
      size: 3 + Math.floor(Math.random() * 6),
      color: colors[i % colors.length],
      dur: `${(0.85 + Math.random() * 0.65).toFixed(2)}s`,
      delay: `${(Math.random() * 0.16).toFixed(2)}s`,
    };
  });
}

function splitPlayerName(fullName) {
  const parts = String(fullName || 'MLB Player').trim().split(/\s+/);
  if (parts.length <= 1) return { first: '', last: parts[0] || 'PLAYER' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function formatHeadlineLines(statLine) {
  const raw = String(statLine || 'OFFICIAL MLB PULL').trim();
  const segments = raw.split(/[•,]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 2) {
    return {
      line1: segments[0].toUpperCase(),
      line2: segments.slice(1, 3).join(' • ').toUpperCase(),
    };
  }
  const words = raw.split(/\s+/);
  if (words.length >= 3) {
    const mid = Math.ceil(words.length / 2);
    return {
      line1: words.slice(0, mid).join(' ').toUpperCase(),
      line2: words.slice(mid).join(' ').toUpperCase(),
    };
  }
  return { line1: raw.toUpperCase(), line2: '' };
}

function formatShortDate(isoOrYmd) {
  if (!isoOrYmd) return 'Nov 2026';
  const s = String(isoOrYmd).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// =========================================================================
// YAHOO-TICKET-STUB INSPIRED 3D COLLECTOR CARD (With Your 6 Rarities!)
// =========================================================================
function TicketCollectorCard({
  card,
  isPinned,
  onTogglePin,
  onOpenPlayer,
  onExportPng,
  TeamLogo,
  size = 'grid', // 'hero' | 'grid'
  notchBg = null,
  notchClass = 'bg-white dark:bg-[#111113]',
}) {
  const [imgStage, setImgStage] = useState(0);
  const cardRef = useRef(null);

  useEffect(() => {
    setImgStage(0);
  }, [card?.playerId]);

  const rarity = RARITY_BY_ID[card.rarityId] || RARITY_BY_ID.BASE;
  const theme = TICKET_THEME[card.rarityId] || TICKET_THEME.BASE;
  const team = getTeamInfo(card.teamAbbr);
  const { first, last } = splitPlayerName(card.fullName);
  const { line1, line2 } = formatHeadlineLines(card.statLine);
  const isHero = size === 'hero';
  const hasScript = card.rarityId === 'SCRIPT_10' || card.rarityId === 'OBSIDIAN_1';

  const serialText = card.serialCap
    ? `${card.serialNumber || 1} / ${card.serialCap}`
    : card.copies > 1
    ? `SERIES 01 • ×${card.copies}`
    : 'SERIES 01';

  const initials = (card.fullName || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const imgUrl =
    imgStage === 0 && card.playerId
      ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_640,q_auto:best/v1/people/${card.playerId}/headshot/silo/current.png`
      : imgStage === 1 && card.playerId
      ? `https://midfield.mlbstatic.com/v1/people/${card.playerId}/spots/213`
      : null;

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const maxTilt = isHero ? 14 : 9;
    const rotY = (x - 0.5) * maxTilt * 2;
    const rotX = (0.5 - y) * maxTilt * 2;
    el.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${isHero ? 1.02 : 1.025})`;
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

  const gm = card.gameMeta;
  const displayDate = formatShortDate(gm?.date || card.pulledAt);
  const subLabel =
    card.packMode === 'GAME_CHECKIN'
      ? `${rarity.name} • Game Check-In`
      : `${rarity.name} • ${card.sourceTag || card.series}`;

  const notchSize = isHero ? 'w-4 h-7' : 'w-2.5 h-4';
  const notchBorderPx = isHero ? '3px' : '2.5px';

  return (
    <div className="hst-card-stage w-full">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`hst-ticket-card hst-ticket-${card.rarityId || 'BASE'} relative w-full aspect-[2.45/3.65] rounded-2xl overflow-hidden select-none flex flex-col justify-between`}
      >
        {/* Dynamic Foil & Glare */}
        <div className="hst-tcg-foil" />
        <div className="hst-tcg-glare" />

        {/* 4 Authentic Ticket-Stub Side Notches (Top L/R, Bottom L/R) */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -left-2 z-30 rounded-r-full ${notchSize} ${notchBg ? '' : notchClass}`}
          style={{
            top: isHero ? '44px' : '26px',
            ...(notchBg ? { backgroundColor: notchBg } : {}),
            borderRight: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderTop: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderBottom: `${notchBorderPx} solid ${theme.notchBorder}`,
          }}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-2 z-30 rounded-l-full ${notchSize} ${notchBg ? '' : notchClass}`}
          style={{
            top: isHero ? '44px' : '26px',
            ...(notchBg ? { backgroundColor: notchBg } : {}),
            borderLeft: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderTop: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderBottom: `${notchBorderPx} solid ${theme.notchBorder}`,
          }}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -left-2 z-30 rounded-r-full ${notchSize} ${notchBg ? '' : notchClass}`}
          style={{
            bottom: isHero ? '44px' : '28px',
            ...(notchBg ? { backgroundColor: notchBg } : {}),
            borderRight: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderTop: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderBottom: `${notchBorderPx} solid ${theme.notchBorder}`,
          }}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-2 z-30 rounded-l-full ${notchSize} ${notchBg ? '' : notchClass}`}
          style={{
            bottom: isHero ? '44px' : '28px',
            ...(notchBg ? { backgroundColor: notchBg } : {}),
            borderLeft: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderTop: `${notchBorderPx} solid ${theme.notchBorder}`,
            borderBottom: `${notchBorderPx} solid ${theme.notchBorder}`,
          }}
        />

        {/* TOP STUB HEADER: Slanted Rarity Ribbon + Serial Counter */}
        <div className={`relative z-20 flex items-center justify-between ${isHero ? 'px-4 pt-3 pb-2' : 'px-2.5 pt-2 pb-1'}`}>
          <span
            className={`hst-rarity-ribbon inline-flex items-center font-display font-black uppercase tracking-wider shadow-sm ${
              isHero ? 'px-3.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[8px]'
            }`}
            style={{ background: theme.ribbonBg, color: theme.ribbonText }}
          >
            {theme.ribbonLabel}
          </span>

          <span
            className={`font-stat font-bold tracking-tight text-white/90 ${
              isHero ? 'text-xs' : 'text-[9px]'
            }`}
          >
            {serialText}
          </span>
        </div>

        {/* Top Perforated Ticket Line */}
        <div className={`relative z-20 ${isHero ? 'mx-4' : 'mx-2.5'} text-white`}>
          <div className="hst-ticket-perf" />
        </div>

        {/* CENTER BEVELED COLLECTOR WINDOW */}
        <div className={`relative z-20 flex-1 flex flex-col min-h-0 ${isHero ? 'px-3.5 py-2.5' : 'px-2 py-1.5'}`}>
          {/* Small Brand Mark tucked cleanly into top-right corner */}
          <div
            className={`pointer-events-none absolute z-30 font-display font-black italic tracking-tighter drop-shadow ${
              isHero ? 'top-4 right-5 text-xs' : 'top-2.5 right-3 text-[7px]'
            }`}
            style={{ color: theme.headlineColor }}
          >
            HST!
          </div>

          <div
            onClick={() => onOpenPlayer && onOpenPlayer(card.playerId, card.fullName, card.teamAbbr)}
            className="hst-inner-window relative flex-1 rounded-xl overflow-hidden border border-white/25 flex flex-col justify-between cursor-pointer group"
            style={{
              background: `linear-gradient(150deg, ${team.color}cc 0%, #1d1424 58%, #100e18 100%)`,
            }}
            title="Click to open full MLB player profile"
          >
            {/* Huge Faded Right-Side Watermark */}
            <div
              className={`pointer-events-none absolute -right-2 top-1 font-display font-black leading-none text-white/[0.11] tracking-tighter select-none ${
                isHero ? 'text-[118px]' : 'text-[64px]'
              }`}
            >
              {team.abbr}
            </div>

            {/* Top-Left Stacked Player Name & Position (Floating Over Portrait Space Like Yahoo Card) */}
            <div
              className={`pointer-events-none absolute top-0 left-0 z-20 ${
                isHero ? 'p-3.5 max-w-[56%]' : 'p-2 max-w-[64%]'
              }`}
            >
              {first && (
                <div
                  className={`font-display font-extrabold uppercase tracking-wide text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] leading-none truncate ${
                    isHero ? 'text-xs' : 'text-[8px]'
                  }`}
                >
                  {first}
                </div>
              )}
              <div
                className={`font-display font-black uppercase tracking-tight text-white group-hover:text-amber-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] transition-colors leading-tight truncate ${
                  isHero ? 'text-xl mt-0.5' : 'text-[11px]'
                }`}
              >
                {last}
              </div>
              <div
                className={`font-stat font-semibold text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] truncate ${
                  isHero ? 'text-[10px]' : 'text-[7px]'
                }`}
              >
                {card.position || 'MLB'} • {team.abbr}
              </div>
            </div>

            {/* Full-Height Transparent MLB Upper-Body Cutout (Zero Hat Clipping!) */}
            <div
              className={`relative z-10 flex-1 min-h-0 flex items-end justify-center overflow-hidden ${
                isHero ? 'pt-8 px-2' : 'pt-5 px-1'
              }`}
            >
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={card.fullName}
                  onError={() => setImgStage((s) => s + 1)}
                  className={`object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.8)] ${
                    imgStage === 1
                      ? isHero
                        ? 'w-36 h-36 rounded-full object-cover mb-4 border-2 border-white/30'
                        : 'w-16 h-16 rounded-full object-cover mb-2 border border-white/30'
                      : 'max-h-full max-w-[92%] w-auto h-auto'
                  }`}
                />
              ) : (
                <div
                  className={`${isHero ? 'w-28 h-28 text-3xl mb-5' : 'w-14 h-14 text-base mb-2'} rounded-full flex items-center justify-center font-display font-black text-white border-2 border-white/30`}
                  style={{ backgroundColor: team.color }}
                >
                  {initials}
                </div>
              )}

              {/* Script Signature Sweep for /10 Gold Ink Script & 1/1 Obsidian */}
              {hasScript && (
                <div
                  className={`pointer-events-none absolute inset-x-2 bottom-1 text-center font-serif italic font-bold -rotate-6 drop-shadow-[0_3px_8px_rgba(0,0,0,0.95)] truncate z-30 ${
                    card.rarityId === 'OBSIDIAN_1' ? 'text-red-400' : 'text-amber-300'
                  } ${isHero ? 'text-2xl' : 'text-xs'}`}
                >
                  {card.fullName}
                </div>
              )}
            </div>

            {/* Bottom Frosted Achievement / Stat Plaque (Just like "150 CAREER INNINGS") */}
            <div
              className={`relative z-20 bg-[#141226]/92 backdrop-blur-md border-t border-white/15 text-center ${
                isHero ? 'px-3 py-3.5' : 'px-1.5 py-2'
              }`}
            >
              <div
                className={`font-display font-black uppercase tracking-tight leading-tight truncate ${
                  isHero ? 'text-xl' : 'text-[10px]'
                }`}
                style={{ color: theme.headlineColor }}
              >
                {line1}
              </div>
              {line2 && (
                <div
                  className={`font-display font-black uppercase tracking-tight leading-tight truncate ${
                    isHero ? 'text-base mt-0.5' : 'text-[9px]'
                  }`}
                  style={{ color: theme.headlineColor }}
                >
                  {line2}
                </div>
              )}
              <div
                className={`font-stat font-semibold text-white/65 truncate ${
                  isHero ? 'text-[10px] mt-1.5' : 'text-[7px] mt-0.5'
                }`}
              >
                {subLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Perforated Ticket Line */}
        <div className={`relative z-20 ${isHero ? 'mx-4' : 'mx-2.5'} text-white`}>
          <div className="hst-ticket-perf" />
        </div>

        {/* BOTTOM STUB FOOTER: Date (Left) & Matchup Scoreboard or Club Emblem (Right) */}
        <div className={`relative z-20 flex items-center justify-between gap-1 ${isHero ? 'px-4 pt-2 pb-3' : 'px-2.5 pt-1 pb-2'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-flex items-center justify-center rounded-sm bg-white/10 text-white/80 shrink-0 ${
                isHero ? 'w-5 h-3.5' : 'w-3.5 h-3'
              }`}
            >
              <Flame className={isHero ? 'w-3 h-3 text-red-400' : 'w-2 h-2 text-red-400'} />
            </span>
            <span className={`font-stat font-semibold text-white/75 truncate ${isHero ? 'text-[11px]' : 'text-[8px]'}`}>
              {displayDate}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {gm && gm.awayRuns !== null && gm.homeRuns !== null ? (
              <div className={`flex items-center gap-1 font-stat font-extrabold text-white ${isHero ? 'text-xs' : 'text-[8px]'}`}>
                {TeamLogo && <TeamLogo abbr={gm.awayAbbr} size="xs" className={isHero ? '!w-4 !h-4' : '!w-3 !h-3'} />}
                <span>{gm.awayRuns}</span>
                <span className={`text-white/55 font-bold uppercase ${isHero ? 'text-[8px] px-0.5' : 'text-[6px]'}`}>
                  {gm.status === 'FINAL' ? 'FINAL' : gm.status.slice(0, 6)}
                </span>
                <span>{gm.homeRuns}</span>
                {TeamLogo && <TeamLogo abbr={gm.homeAbbr} size="xs" className={isHero ? '!w-4 !h-4' : '!w-3 !h-3'} />}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {TeamLogo && <TeamLogo abbr={team.abbr} size="xs" className={isHero ? '!w-4 !h-4' : '!w-3 !h-3'} />}
                <span className={`font-stat font-extrabold text-white/90 ${isHero ? 'text-[11px]' : 'text-[8px]'}`}>
                  {team.abbr}
                </span>
              </div>
            )}

            {/* Quick Pin & PNG buttons on grid cards */}
            {!isHero && (
              <div className="flex items-center gap-0.5 ml-0.5">
                {onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(card.uid);
                    }}
                    title={isPinned ? 'Unpin from Showcase' : 'Pin to Profile'}
                    className={`p-1 rounded border transition ${
                      isPinned
                        ? 'bg-red-600/30 border-red-400/70 text-red-300'
                        : 'border-white/15 bg-black/35 text-zinc-400 hover:text-white'
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
                    title="Download Card PNG"
                    className="p-1 rounded border border-white/15 bg-black/35 text-zinc-300 hover:text-white transition"
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
  // Triumph-Style 5-Stage Reveal Flow:
  // 'idle' -> 'choose' (3-pack carousel) -> 'energy' (glowing block + fireworks) -> 'spin' (color-cycling 3D spin) -> 'lock' (final color suspense) -> 'revealed' (Yahoo Ticket Stage)
  const [rippingStage, setRippingStage] = useState('idle');
  const [revealData, setRevealData] = useState(null);
  const [selectedPackSlot, setSelectedPackSlot] = useState(1);
  const [spinColorIdx, setSpinColorIdx] = useState(0);
  const [fireworks, setFireworks] = useState([]);
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
    timersRef.current.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    timersRef.current = [];
  };

  const [lastRippedGame, setLastRippedGame] = useState(null);

  useEffect(() => () => clearTimers(), []);

  // Lock page scrolling & allow Escape key close while the Pack Theater is open
  useEffect(() => {
    if (rippingStage === 'idle') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && (rippingStage === 'choose' || rippingStage === 'revealed')) {
        clearTimers();
        setRippingStage('idle');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [rippingStage]);

  useEffect(() => {
    if (pendingReveal) {
      clearTimers();
      setRevealData(pendingReveal);
      setLastRippedGame(pendingReveal.gamePk ? { gamePk: pendingReveal.gamePk } : null);
      setSelectedPackSlot(1);
      setFireworks([]);
      setRippingStage('choose');
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

  const launchPackCarousel = (data) => {
    clearTimers();
    setRevealData(data);
    setSelectedPackSlot(1);
    setFireworks([]);
    setRippingStage('choose');
  };

  // Triumph-Style Sequence: Select 1 of 3 Packs -> Selected Zoom -> Energy Block + Fireworks -> Rapid Color-Cycling 3D Spin -> Color Lock -> Card Reveal!
  const handleSelectCarouselPack = (slotIndex) => {
    if (!revealData || rippingStage !== 'choose') return;
    clearTimers();
    setSelectedPackSlot(slotIndex);
    setRippingStage('selected');

    const rarity = RARITY_BY_ID[revealData.card?.rarityId] || RARITY_BY_ID.BASE;
    const theme = TICKET_THEME[rarity.id] || TICKET_THEME.BASE;

    playPackSound('select', rarity.rank, soundMuted);

    // Stage 2: Solid glowing energy silhouette + fireworks explosion
    const tEnergy = setTimeout(() => {
      setFireworks(generateFireworkBurst(theme.particles, theme.sparkColors));
      playPackSound('fireworks', rarity.rank, soundMuted);
      setRippingStage('energy');
    }, 340);

    // Stage 3: Rapid 3D color-cycling roulette spin on the card back
    const tSpin = setTimeout(() => {
      setRippingStage('spin');
      let step = 0;
      const cycleInterval = setInterval(() => {
        step++;
        setSpinColorIdx(step % ROULETTE_CYCLE_COLORS.length);
        playPackSound('tick', step % ROULETTE_CYCLE_COLORS.length, soundMuted);
      }, 150);
      timersRef.current.push(cycleInterval);

      // Stop cycling right as the spin decelerates and LOCK onto the final rarity color!
      const tLock = setTimeout(() => {
        clearInterval(cycleInterval);
        setRippingStage('lock');
        playPackSound('lock', rarity.rank, soundMuted);
      }, 1680);

      // Stage 4: Flash & flip open into the full Ticket-Stub Collector Card
      const tReveal = setTimeout(() => {
        setFireworks(generateFireworkBurst(theme.particles, theme.sparkColors));
        playPackSound('reveal', rarity.rank, soundMuted);
        setRippingStage('revealed');
      }, 2350);

      timersRef.current.push(tLock, tReveal);
    }, 1260);

    timersRef.current.push(tEnergy, tSpin);
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
    setLastRippedGame(null);
    launchPackCarousel({
      card: result.card,
      isDuplicate: result.isDuplicate,
      packTitle: '2026–27 HOT STOVE PACK',
      packSubtitle: `${hotStovePool.length} active offseason players`,
      packTheme: 'gold',
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
    if (!game?.gamePk || rippingGamePk) return;
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
      setLastRippedGame(game);
      launchPackCarousel({
        card: result.card,
        isDuplicate: result.isDuplicate,
        packTitle: `${boxData.away?.abbr || 'AWY'} @ ${boxData.home?.abbr || 'HME'} GAME PACK`,
        packSubtitle: `${pool.length} players from this box score`,
        packTheme: 'crimson',
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
  const revealTheme = TICKET_THEME[revealRarity.id] || TICKET_THEME.BASE;
  const revealTeam = revealData?.card ? getTeamInfo(revealData.card.teamAbbr) : getTeamInfo('MLB');
  const activeSpinStyle =
    rippingStage === 'lock'
      ? { bg: revealTheme.spinBg, glow: revealTheme.spinGlow, label: revealTheme.spinLabel }
      : ROULETTE_CYCLE_COLORS[spinColorIdx % ROULETTE_CYCLE_COLORS.length];

  return (
    <div className="space-y-6">
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
              <span className="px-1.5 py-0.5 rounded font-stat text-[9px] font-bold uppercase bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                v3.4
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick 1 of 3 foil packs every 6 hours • Rarity roulette reveal • Ticket-stub collector cards (/99, /25, /10, 1/1)
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
            title="Enable Sandbox Test Mode to bypass the 6-hour timer and preview every rarity spin"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{vault.testMode ? 'Test Mode: ON' : 'Test Mode'}</span>
          </button>
        </div>
      </div>

      {/* Sandbox Controls */}
      {vault.testMode && (
        <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-stat font-extrabold uppercase text-[11px] text-amber-500">
              Sandbox Controls:
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              Force rarity lock:
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
              <h3 className="text-lg font-black">2026–27 Hot Stove Gold Pack</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Pick 1 of 3 foil packs to rip a ticket-stub collector card from official MLB signings, trades, and the 2026–27 free-agent class.
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
              <span>{packReady ? 'Open Hot Stove Pack' : `Locked (${formatCooldownShort(cooldownMs)})`}</span>
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
                Stamped with exact matchup &amp; score
              </span>
            </div>

            <div>
              <h3 className="text-lg font-black">Game Box-Score Pack</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {usingReplayGames
                  ? 'No live MLB games are scheduled right now—rip packs from 2026 World Series & classic games to see the full scoreboard ticket stub in action.'
                  : 'Check into any live or final MLB game to pull 1 player who appeared in that box score, stamped with their stat line and score.'}
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
                        {busy ? 'Loading...' : alreadyClaimed ? 'Claimed' : 'Open Pack'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned Profile Showcase (6-Card Ticket Trophy Case) */}
      <section className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Pin className="w-4 h-4 text-sky-500" />
              <span>@{vault.handle || 'collector'} — Pinned Showcase ({pinnedCards.length}/{MAX_PINNED_CARDS})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hover any ticket card to tilt the foil • Pin up to 6 favorite pulls to your profile shelf.
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
                  className="aspect-[2.45/3.65] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col items-center justify-center gap-1.5 p-4 text-center"
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
              <TicketCollectorCard
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
                ? 'Your binder is empty — open your first Hot Stove or Game Box-Score pack above!'
                : 'No cards match this filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredBinder.map((card) => (
              <TicketCollectorCard
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
          TRIUMPH-STYLE PACK CAROUSEL + ROULETTE SPIN + TICKET CARD STAGE
          Mounted directly to document.body via createPortal so it is ALWAYS
          centered in your viewport with zero scrolling required!
          ================================================================= */}
      {rippingStage !== 'idle' && revealData && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] h-[100dvh] w-screen flex items-center justify-center p-4 overflow-y-auto overflow-x-hidden transition-all duration-700"
          style={{
            background:
              rippingStage === 'revealed'
                ? revealTheme.backdrop
                : 'radial-gradient(circle at 50% 45%, #19130a 0%, #070606 60%, #020203 100%)',
          }}
          onClick={() => {
            if (rippingStage === 'revealed') {
              clearTimers();
              setRippingStage('idle');
            }
          }}
        >
          {/* Floating Ambient Starfield Sparkles */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            {AMBIENT_SPARKLES.map((sp) => (
              <span
                key={sp.id}
                className="absolute rounded-full bg-amber-200/80 animate-twinkle"
                style={{
                  left: sp.left,
                  top: sp.top,
                  width: `${sp.size}px`,
                  height: `${sp.size}px`,
                  boxShadow: '0 0 10px rgba(254, 240, 138, 0.75)',
                  '--dur': sp.dur,
                  '--delay': sp.delay,
                }}
              />
            ))}
          </div>

          {/* Fireworks Explosion Layer */}
          {(rippingStage === 'energy' || rippingStage === 'revealed') && (
            <div className="pointer-events-none fixed left-1/2 top-1/2 z-10">
              {fireworks.map((fw) => (
                <span
                  key={`${rippingStage}-${fw.id}`}
                  className="absolute rounded-full animate-firework-spark"
                  style={{
                    width: `${fw.size}px`,
                    height: `${fw.size}px`,
                    backgroundColor: fw.color,
                    boxShadow: `0 0 12px ${fw.color}`,
                    '--tx': fw.tx,
                    '--ty': fw.ty,
                    '--dur': fw.dur,
                    '--delay': fw.delay,
                  }}
                />
              ))}
            </div>
          )}

          {/* Full-Screen Flash on Lock -> Reveal */}
          {rippingStage === 'revealed' && (
            <div
              className="pointer-events-none fixed inset-0 animate-screen-flash z-30"
              style={{ backgroundColor: revealTheme.spinGlow }}
            />
          )}

          {/* Top Navigation Circles on Revealed Ticket Stage (Matches Yahoo Sports Layout) */}
          {rippingStage === 'revealed' && (
            <div
              className="fixed top-5 inset-x-5 max-w-md mx-auto flex items-center justify-between z-40"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  clearTimers();
                  setRippingStage('idle');
                }}
                aria-label="Close reveal"
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition"
              >
                <ChevronDown className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => exportPulledCardPng(revealData.card, revealTeam)}
                aria-label="Save trading card PNG"
                title="Download High-Res Ticket Card PNG"
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition"
              >
                <Share className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* MAIN CENTER THEATER */}
          <div
            className="relative z-20 w-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button on Choose stage so user is never trapped */}
            {rippingStage === 'choose' && (
              <button
                type="button"
                onClick={() => {
                  clearTimers();
                  setRippingStage('idle');
                }}
                aria-label="Close pack selector"
                className="fixed top-5 right-5 z-40 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* STAGE 1 & 1.5: TRIUMPH 3-PACK FOIL CAROUSEL -> SELECTED PACK ZOOM */}
            {(rippingStage === 'choose' || rippingStage === 'selected') && (
              <div className="w-full max-w-3xl text-center space-y-6 animate-fade-up">
                <div className="space-y-1">
                  <p className="font-display text-lg sm:text-xl font-bold text-white/90 tracking-tight">
                    {rippingStage === 'selected' ? `Opening Pack #${selectedPackSlot + 1}...` : 'Tap to select a pack to open'}
                  </p>
                  <p className="font-stat text-[11px] uppercase tracking-[0.2em] text-amber-300/80">
                    {revealData.packTitle} • {revealData.packSubtitle}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 sm:gap-6 px-2">
                  {[0, 1, 2].map((slotIdx) => {
                    const isCenter = slotIdx === 1;
                    const isPicked = rippingStage === 'selected' && selectedPackSlot === slotIdx;
                    const isFadedOut = rippingStage === 'selected' && selectedPackSlot !== slotIdx;
                    const packClass =
                      revealData.packTheme === 'crimson'
                        ? 'hst-triumph-pack-crimson'
                        : 'hst-triumph-pack';
                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        disabled={rippingStage !== 'choose'}
                        onClick={() => handleSelectCarouselPack(slotIdx)}
                        className={`group relative rounded-xl overflow-hidden border border-amber-200/35 transition-all duration-300 cursor-pointer focus:outline-none ${packClass} ${
                          isPicked
                            ? 'w-[165px] sm:w-[220px] h-[270px] sm:h-[360px] scale-110 -translate-y-3 z-30 shadow-[0_0_60px_rgba(250,204,21,0.7)]'
                            : isFadedOut
                            ? 'w-[120px] sm:w-[185px] h-[210px] sm:h-[310px] opacity-0 scale-90 pointer-events-none z-0'
                            : isCenter
                            ? 'w-[165px] sm:w-[220px] h-[270px] sm:h-[360px] scale-100 z-20 hover:scale-105 hover:-translate-y-2'
                            : 'w-[120px] sm:w-[185px] h-[210px] sm:h-[310px] opacity-70 hover:opacity-100 hover:scale-105 hover:-translate-y-1.5 z-10'
                        }`}
                      >
                        {/* Metallic Foil Sheen */}
                        <div className="pointer-events-none absolute inset-0 hst-pack-sheen" />

                        {/* Top Serrated Metallic Crimp */}
                        <div className="absolute inset-x-0 top-0 h-4 hst-pack-crimp border-b border-amber-200/25" />

                        {/* Center Foil Pack Graphic */}
                        <div className="relative z-10 h-full flex flex-col items-center justify-between py-7 px-3">
                          <div className="space-y-0.5 text-center">
                            <div className="font-stat text-[9px] font-extrabold uppercase tracking-[0.25em] text-amber-200/85">
                              COLLECTIBLES
                            </div>
                            <div className="font-stat text-[8px] text-white/50">
                              PACK #{slotIdx + 1}
                            </div>
                          </div>

                          <div className="space-y-2.5 text-center">
                            <div className="font-display font-black text-base sm:text-2xl tracking-[0.14em] text-white drop-shadow-[0_4px_14px_rgba(0,0,0,0.85)]">
                              HOT STOVE
                            </div>
                            <div className="mx-auto w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 border-amber-200/60 bg-black/50 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Flame className="w-6 h-6 sm:w-7 sm:h-7 text-amber-300" />
                            </div>
                          </div>

                          <div className="w-full py-1.5 rounded bg-black/55 border border-white/15 font-stat text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-100">
                            {revealData.packTheme === 'crimson' ? 'MLB GAME PACK' : 'MLB GOLD PACK'}
                          </div>
                        </div>

                        {/* Bottom Serrated Metallic Crimp */}
                        <div className="absolute inset-x-0 bottom-0 h-4 hst-pack-crimp border-t border-amber-200/25" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STAGE 2: SOLID BLAZING ENERGY SILHOUETTE + FIREWORKS */}
            {rippingStage === 'energy' && (
              <div className="flex flex-col items-center justify-center space-y-5">
                <div
                  className="w-[235px] sm:w-[270px] aspect-[2.45/3.65] rounded-2xl animate-energy-charge"
                  style={{
                    background: 'linear-gradient(160deg, #fef08a 0%, #facc15 55%, #eab308 100%)',
                    boxShadow:
                      '0 0 80px 18px rgba(250, 204, 21, 0.72), 0 0 140px 36px rgba(234, 179, 8, 0.38)',
                  }}
                />
                <div className="font-stat text-xs font-black uppercase tracking-[0.3em] text-amber-200 animate-pulse">
                  IGNITING PACK #{selectedPackSlot + 1}...
                </div>
              </div>
            )}

            {/* STAGE 3 & 4: TRIUMPH 3D COLOR-CYCLING ROULETTE CARD SPIN -> FINAL RARITY LOCK */}
            {(rippingStage === 'spin' || rippingStage === 'lock') && (
              <div className="hst-card-stage flex flex-col items-center justify-center space-y-6">
                <div
                  className={`w-[240px] sm:w-[276px] aspect-[2.45/3.65] rounded-2xl relative overflow-hidden border-2 border-white/50 transition-colors duration-100 ${
                    rippingStage === 'spin' ? 'animate-roulette-spin' : 'scale-105 transition-transform duration-300'
                  }`}
                  style={{
                    backgroundColor: activeSpinStyle.bg,
                    boxShadow: `0 0 70px 14px ${activeSpinStyle.glow}, inset 0 0 30px rgba(255,255,255,0.35)`,
                  }}
                >
                  {/* Geometric Diamond Lattice Pattern (Just Like Triumph's Card Back!) */}
                  <div className="absolute inset-0 hst-card-back-lattice" />
                  <div className="absolute inset-3 rounded-xl border-2 border-white/40 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur-sm border border-white/45 flex items-center justify-center">
                      <Flame className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <div
                    className="font-display font-black text-xl sm:text-2xl uppercase tracking-[0.2em] transition-colors duration-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                    style={{ color: activeSpinStyle.bg === '#64748b' ? '#e2e8f0' : activeSpinStyle.bg }}
                  >
                    {rippingStage === 'lock' ? `${activeSpinStyle.label}!` : activeSpinStyle.label}
                  </div>
                  <div className="font-stat text-[10px] font-bold uppercase tracking-[0.26em] text-white/60">
                    {rippingStage === 'lock' ? 'RARITY LOCKED — REVEALING...' : 'ROLLING RARITY...'}
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 5: FULL-SCREEN TICKET-STUB COLLECTOR CARD REVEAL (Yahoo Sports Style) */}
            {rippingStage === 'revealed' && (
              <div className="w-full max-w-[308px] sm:max-w-[332px] flex flex-col items-center space-y-4 pt-8 pb-4">
                <div className="w-full animate-final-flip">
                  <TicketCollectorCard
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
                    notchBg={revealTheme.heroNotchBg}
                  />
                </div>

                {/* Wide Pill Primary CTA ("Pin to Profile") — Matching Reference Layout */}
                <div className="w-full space-y-2.5">
                  <button
                    type="button"
                    onClick={() => togglePin(revealData.card.uid)}
                    className={`w-full py-3 rounded-full text-sm font-bold border transition inline-flex items-center justify-center gap-2 backdrop-blur-md ${
                      vault.pinnedIds.includes(revealData.card.uid)
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/45'
                    }`}
                  >
                    <Pin className={`w-4 h-4 ${vault.pinnedIds.includes(revealData.card.uid) ? 'fill-current' : ''}`} />
                    <span>
                      {vault.pinnedIds.includes(revealData.card.uid) ? 'Pinned to Profile' : 'Pin to Profile'}
                    </span>
                  </button>

                  <div className="flex items-center justify-center gap-5 pt-1 text-xs font-bold">
                    {vault.testMode && (
                      <button
                        type="button"
                        disabled={Boolean(rippingGamePk)}
                        onClick={() => (lastRippedGame ? handleRipFromGame(lastRippedGame) : handleRipHotStove())}
                        className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 disabled:opacity-50 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {rippingGamePk
                            ? 'Loading Pack...'
                            : lastRippedGame
                            ? 'Rip Same Game Again'
                            : 'Rip Another Pack'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        clearTimers();
                        setRippingStage('idle');
                      }}
                      className="text-white/75 hover:text-white transition"
                    >
                      Keep in Binder
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
