import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  RefreshCw, Sun, Moon, Search, Filter, Download, ArrowLeft, Zap,
  CheckCircle2, Clock, AlertTriangle, Users, Trophy, Flame,
  X, ShieldAlert, ArrowLeftRight, Database,
  ExternalLink, DollarSign, Activity, Star, BarChart3, Calendar,
  ChevronLeft, ChevronRight, Award, Shield, Bookmark, Play, Share2, Check, ArrowUp, History, ChevronDown, Scale, Pin, User
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { exportPlayerCardPng, exportCompareCardPng } from './lib/cardExporter';
import ProfileHub from './components/ProfileHub';
import PlayerPortrait from './components/PlayerPortrait';
import {
  loadPinnedPlayers,
  savePinnedPlayers,
  loadUserProfile,
  saveUserProfile,
  getProfileDisplayName,
  isEligibleToPinPlayer,
  normalizePinnedPlayer,
  resolveActiveTeamAbbr,
} from './lib/pinnedPlayers';
import { MLB_TEAMS, DIVISIONS, getTeamInfo, decodeHtml } from './data/mlbData';

const NOW_DATE = new Date();
const LATEST_MLB_SEASON = NOW_DATE.getMonth() >= 2 ? NOW_DATE.getFullYear() : NOW_DATE.getFullYear() - 1;
const LATEST_OFFSEASON_START = NOW_DATE.getMonth() >= 9 ? NOW_DATE.getFullYear() : NOW_DATE.getFullYear() - 1;
const OFFSEASON_CYCLES = Array.from({ length: 4 }, (_, i) => {
  const yr = LATEST_OFFSEASON_START - i;
  return `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
});
const FA_CLASS_YEARS = Array.from({ length: 12 }, (_, i) => String(LATEST_MLB_SEASON - i));
const ALL_SEASON_YEARS = Array.from({ length: Math.max(1, LATEST_MLB_SEASON - 2000 + 1) }, (_, i) => String(LATEST_MLB_SEASON - i));
const QUICK_YEARS = [String(LATEST_MLB_SEASON), String(LATEST_MLB_SEASON - 1), String(LATEST_MLB_SEASON - 2)];
const MAIN_TAB_ORDER = ['feed', 'freeAgents', 'scoresStandings', 'leaders', 'teamHub', 'leaderboard'];

const QUICK_JUMP_DATES = [
  { label: '2026 WS G5 (MIL @ TB)', date: '2026-10-28' },
  { label: '2026 WS G4 (12 Inn)', date: '2026-10-27' },
  { label: 'July 4, 2026 Slate', date: '2026-07-04' },
  { label: '2026 Opening Slate', date: '2026-03-28' },
];

function getInitialUrlParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

const LEADER_LABELS = {
  battingAverage: 'Batting Average (AVG)',
  homeRuns: 'Home Runs (HR)',
  runsBattedIn: 'Runs Batted In (RBI)',
  onBasePlusSlugging: 'OPS',
  hits: 'Hits (H)',
  stolenBases: 'Stolen Bases (SB)',
  earnedRunAverage: 'ERA',
  wins: 'Wins (W)',
  strikeouts: 'Strikeouts (SO)',
  whip: 'WHIP',
  walksAndHitsPerInningPitched: 'WHIP',
  saves: 'Saves (SV)',
  inningsPitched: 'Innings Pitched (IP)',
};

const LEADER_ORDER = {
  battingAverage: 1,
  homeRuns: 2,
  runsBattedIn: 3,
  onBasePlusSlugging: 4,
  hits: 5,
  stolenBases: 6,
  earnedRunAverage: 1,
  wins: 2,
  strikeouts: 3,
  whip: 4,
  walksAndHitsPerInningPitched: 4,
  saves: 5,
  inningsPitched: 6,
};

function formatLeaderCategory(cat) {
  if (!cat) return 'Stat';
  if (LEADER_LABELS[cat]) return LEADER_LABELS[cat];
  return String(cat)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase());
}

function getWcCutoffIndex(seasonStr) {
  const yr = Number(seasonStr);
  if (yr >= 2022) return 2;       // Top 3 Wild Card teams
  if (yr === 2020) return -1;     // Expanded 2020 format (no standard WC line)
  if (yr >= 2012) return 1;       // Top 2 Wild Card teams
  if (yr >= 1995) return 0;       // Single Wild Card team
  return -1;
}

// Compute WCAG luminance so gold/yellow badges (SD, PIT) get dark text and dark-navy badges (MIL, TB, NYY, SEA, MIN) get a crisp border
function getTeamBadgeStyle(hexColor) {
  const hex = String(hexColor || '#334155').replace('#', '');
  let r = 51, g = 65, b = 85;
  if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = lum > 0.62;
  const isVeryDark = lum < 0.24;
  return {
    backgroundColor: hexColor || '#334155',
    color: isLight ? '#0f172a' : '#ffffff',
    border: isVeryDark ? '1px solid rgba(148, 163, 184, 0.38)' : '1px solid rgba(255, 255, 255, 0.12)',
  };
}

const MLB_ABBR_TO_ID = {
  LAA: 108, ARI: 109, BAL: 110, BOS: 111, CHC: 112,
  CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117,
  KC:  118, LAD: 119, WSH: 120, NYM: 121, ATH: 133,
  PIT: 134, SD:  135, SEA: 136, SF:  137, STL: 138,
  TB:  139, TEX: 140, TOR: 141, MIN: 142, PHI: 143,
  ATL: 144, CWS: 145, MIA: 146, NYY: 147, MIL: 158,
  // Legacy / alternate abbreviations
  OAK: 133, WAS: 120, CHW: 145, TBR: 139, SFG: 137, SDP: 135, KCR: 118,
};

function getMlbTeamId(abbr) {
  return MLB_ABBR_TO_ID[String(abbr || '').toUpperCase()] || null;
}

function TeamLogo({ abbr, size = 'md', variant = 'dark', className = '' }) {
  const [stage, setStage] = useState(0); // 0 = cap-on-dark/light, 1 = generic team-logos, 2 = text fallback
  const teamId = getMlbTeamId(abbr);
  const info = getTeamInfo(abbr);

  useEffect(() => {
    setStage(0);
  }, [abbr, variant]);

  const sizeMap = {
    xs: 'w-5 h-5',
    sm: 'w-6 h-6',
    md: 'w-7 h-7',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };
  const dims = sizeMap[size] || sizeMap.md;

  if (!teamId || stage >= 2) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md text-[10px] font-black shrink-0 shadow-sm px-1 ${dims} ${className}`}
        style={getTeamBadgeStyle(info.color)}
      >
        {info.abbr}
      </span>
    );
  }

  const src =
    stage === 0
      ? `https://www.mlbstatic.com/team-logos/${variant === 'light' ? 'team-cap-on-light' : 'team-cap-on-dark'}/${teamId}.svg`
      : `https://www.mlbstatic.com/team-logos/${teamId}.svg`;

  return (
    <img
      src={src}
      alt={info.name}
      loading="lazy"
      onError={() => setStage((s) => s + 1)}
      className={`${dims} object-contain shrink-0 select-none ${className}`}
    />
  );
}

function isFreeAgencyElection(tx) {
  const h = (tx?.headline || '').toLowerCase();
  return h.includes('elected free agency') || h.includes('declared free agency');
}

function isMajorLeagueMove(tx) {
  if (!tx) return false;
  if (tx.is_major_league === false) return false;
  const h = decodeHtml(tx.headline || '');
  if (/\b(minor league|minor-league|minor league phase|dominican summer league|arizona complex league|florida complex league|dsl|acl|fcl)\b/i.test(h)) {
    return false;
  }
  if (tx.move_type === 'TRADE') {
    const legs = [...(tx.team_a_receives || []), ...(tx.team_b_receives || [])].filter(
      (p) => p && p.playerId
    );
    if (legs.length > 0 && legs.every((p) => p.level === 'MiLB')) {
      return false;
    }
  }
  return true;
}

function getEffectiveMoveType(tx) {
  const h = (tx?.headline || '').toLowerCase();
  if (h.includes('injured list') || h.includes('10-day il') || h.includes('15-day il') || h.includes('60-day il') || h.includes('rehab assignment')) {
    return 'INJURED_LIST';
  }
  if (h.includes('recalled') || h.includes('optioned') || h.includes('selected the contract') || h.includes('purchased the contract')) {
    return 'CALLUP_OPTION';
  }
  if (isFreeAgencyElection(tx)) return 'FREE_AGENCY';
  return tx?.move_type || 'SIGNING';
}

function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function getFeedDateKey(isoStr) {
  if (!isoStr) return 'unknown';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 'unknown';
  return getLocalDateStr(dt);
}

function formatFeedDateHeading(dateKey) {
  if (!dateKey || dateKey === 'unknown') return 'Recent Moves';
  const todayKey = getLocalDateStr();
  const yesterdayKey = shiftDateStr(todayKey, -1);
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const MOVE_TYPE_LABELS = {
  SIGNING: 'Signings',
  TRADE: 'Trades',
  EXTENSION: 'Extensions',
  FREE_AGENCY: 'Free Agency',
  INJURED_LIST: 'Injured List',
  CALLUP_OPTION: 'Call-Ups / Options',
  DFA_WAIVER: 'DFAs & Waivers',
};

function parseStatLineCells(statLine) {
  if (!statLine || typeof statLine !== 'string') return [];
  const parts = statLine
    .split('•')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return [];
  const cells = [];
  for (const part of parts.slice(0, 3)) {
    const openIdx = part.indexOf('(');
    const closeIdx = part.endsWith(')') ? part.length - 1 : -1;
    if (openIdx > 0 && closeIdx > openIdx) {
      const mainPart = part.slice(0, openIdx).trim();
      const extraPart = part.slice(openIdx + 1, closeIdx).trim();
      const mMain = mainPart.match(/^([.\d+-]+)\s+([A-Za-z+%/]+)$/);
      if (mMain) {
        cells.push({ val: mMain[1], lbl: `${mMain[2]} · ${extraPart}` });
        continue;
      }
    }
    const mSimple = part.match(/^([.\d+-]+)\s+([A-Za-z+%/]+)$/);
    if (mSimple) {
      cells.push({ val: mSimple[1], lbl: mSimple[2] });
      continue;
    }
    cells.push({ val: part, lbl: 'STAT' });
  }
  return cells;
}

function BrandLogo({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={`${className} shrink-0 drop-shadow`}>
      <defs>
        <linearGradient id="hstBg" x1="12" y1="8" x2="108" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="52%" stopColor="#e11d48" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="hstFlame" x1="60" y1="16" x2="60" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#hstBg)" />
      <rect x="10" y="10" width="100" height="100" rx="24" fill="#0f172a" fillOpacity="0.88" />
      <path d="M61 18C61 18 88 39 88 67C88 84.5 75.5 98 60 98C44.5 98 32 84.5 32 67C32 54 40 43 45 38C44 46 48 51 52 51C49 39 54 26 61 18Z" fill="url(#hstFlame)" />
      <circle cx="60" cy="70" r="21" fill="#f8fafc" />
      <path d="M47 55C53 62 53 78 47 85" stroke="#e11d48" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M73 55C67 62 67 78 73 85" stroke="#e11d48" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M45 60L50 58M46 66L51 65M46 74L51 75M45 80L50 82" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
      <path d="M75 60L70 58M74 66L69 65M74 74L69 75M75 80L70 82" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BaseballLoader({ label = 'Loading MLB data...', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center ${compact ? 'py-8 gap-3' : 'py-14 gap-4'} animate-fade-up`}>
      <div className="relative flex items-center justify-center w-14 h-14">
        <span className="absolute inset-0 rounded-full border-2 border-sky-500/45 animate-pulse-ring" />
        <span
          className="absolute inset-1 rounded-full border border-rose-500/40 animate-pulse-ring"
          style={{ animationDelay: '0.45s' }}
        />
        <svg viewBox="0 0 64 64" className="w-11 h-11 animate-spin-ball drop-shadow-md">
          <circle cx="32" cy="32" r="28" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2.5" />
          <path d="M16 14C24 23 24 41 16 50" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 14C40 23 40 41 48 50" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" />
          <path d="M13 21L19 19M15 28L21 27M15 36L21 37M13 43L19 45" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M51 21L45 19M49 28L43 27M49 36L43 37M51 43L45 45" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-300">
        <span>{label}</span>
        <span className="inline-flex items-center gap-0.5 ml-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 hst-dot-1" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 hst-dot-2" />
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 hst-dot-3" />
        </span>
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3 animate-fade-up">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-4 sm:p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded-full hst-shimmer" />
              <div className="h-5 w-24 rounded-md hst-shimmer" />
            </div>
            <div className="h-3.5 w-28 rounded hst-shimmer" />
          </div>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full hst-shimmer shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded hst-shimmer" />
              <div className="h-3 w-1/2 rounded hst-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CardsGridSkeleton({ count = 6, label = '' }) {
  return (
    <div className="space-y-4 animate-fade-up">
      {label && <BaseballLoader label={label} compact />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full hst-shimmer shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded hst-shimmer" />
              <div className="h-3 w-1/3 rounded hst-shimmer" />
              <div className="h-3 w-5/6 rounded hst-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadersSkeleton({ label = 'Loading MLB leaders...' }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <BaseballLoader label={label} compact />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between">
              <div className="h-4 w-32 rounded hst-shimmer" />
              <div className="h-3.5 w-10 rounded hst-shimmer" />
            </div>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full hst-shimmer" />
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded hst-shimmer" />
                  <div className="h-4 w-28 rounded hst-shimmer" />
                </div>
              </div>
              <div className="h-7 w-14 rounded hst-shimmer" />
            </div>
            <div className="p-3 space-y-2.5">
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} className="flex items-center justify-between">
                  <div className="h-3 w-36 rounded hst-shimmer" />
                  <div className="h-3 w-10 rounded hst-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsSkeleton({ label = 'Loading MLB standings...' }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <BaseballLoader label={label} compact />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="h-4 w-24 rounded hst-shimmer" />
            </div>
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} className="flex items-center justify-between gap-3">
                  <div className="h-4 w-28 rounded hst-shimmer" />
                  <div className="h-3.5 w-32 rounded hst-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlidingSegmented({
  options,
  value,
  onChange,
  hiddenIndicator = false,
  variant = 'surface', // 'nav' | 'surface' | 'sky' | 'contrast' | 'card'
  className = '',
  buttonClassName = '',
  asNav = false,
}) {
  const containerRef = useRef(null);
  const btnRefs = useRef(new Map());
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false, animate: false });

  const measure = (allowAnimate = true) => {
    const container = containerRef.current;
    const activeBtn = btnRefs.current.get(value);
    if (!container || !activeBtn || hiddenIndicator) {
      setPill((prev) => ({ ...prev, ready: false }));
      return;
    }
    const left = activeBtn.offsetLeft;
    const width = activeBtn.offsetWidth;
    setPill((prev) => ({
      left,
      width,
      ready: width > 0,
      animate: allowAnimate && prev.ready,
    }));
  };

  useLayoutEffect(() => {
    measure(true);
  }, [value, hiddenIndicator, options.map((o) => `${o.id}:${o.label}`).join('|')]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onResize = () => measure(false);
    window.addEventListener('resize', onResize);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure(false));
      ro.observe(container);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [value, hiddenIndicator]);

  const styles = {
    nav: {
      wrap: 'relative inline-flex items-center gap-1 h-full',
      pill: 'bg-red-600 dark:bg-red-500 rounded-t-sm',
      activeText: 'text-slate-950 dark:text-white',
      idleText: 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
      btn: 'px-2.5 xl:px-3 py-2 text-xs xl:text-[13px] font-semibold whitespace-nowrap tabular-nums',
      insetY: 'bottom-0 h-[2px]',
    },
    surface: {
      wrap: 'relative inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-lg max-w-full overflow-x-auto no-scrollbar',
      pill: 'bg-white dark:bg-slate-900 rounded-lg shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/70',
      activeText: 'text-sky-600 dark:text-sky-400',
      idleText: 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
      btn: 'px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap',
      insetY: 'top-1 bottom-1',
    },
    sky: {
      wrap: 'relative inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-full max-w-full overflow-x-auto no-scrollbar',
      pill: 'bg-sky-600 rounded-full shadow-sm',
      activeText: 'text-white dark:text-zinc-950',
      idleText: 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
      btn: 'px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap',
      insetY: 'top-1 bottom-1',
    },
    contrast: {
      wrap: 'relative inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-full max-w-full overflow-x-auto no-scrollbar',
      pill: 'bg-slate-900 dark:bg-white rounded-full shadow-sm',
      activeText: 'text-white dark:text-slate-900',
      idleText: 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
      btn: 'px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap',
      insetY: 'top-1 bottom-1',
    },
    card: {
      wrap: 'relative inline-flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 max-w-full overflow-x-auto no-scrollbar',
      pill: 'bg-sky-600 rounded-lg shadow-sm',
      activeText: 'text-white dark:text-zinc-950',
      idleText: 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
      btn: 'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap',
      insetY: 'top-1 bottom-1',
    },
    underline: {
      wrap: 'relative flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 w-full overflow-x-auto no-scrollbar',
      pill: 'bg-sky-500 rounded-t-full',
      activeText: 'text-sky-600 dark:text-sky-400',
      idleText: 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
      btn: 'px-3 py-2 text-xs font-bold whitespace-nowrap',
      insetY: 'bottom-0 h-[2px]',
    },
  };

  const st = styles[variant] || styles.surface;
  const WrapperTag = asNav ? 'nav' : 'div';

  return (
    <WrapperTag ref={containerRef} className={`${st.wrap} ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 ${st.insetY} ${st.pill} ${pill.animate ? 'hst-sliding-pill' : ''}`}
        style={{
          transform: `translateX(${pill.left}px)`,
          width: `${pill.width}px`,
          opacity: pill.ready && !hiddenIndicator ? 1 : 0,
        }}
      />
      {options.map((opt) => {
        const isActive = !hiddenIndicator && String(value) === String(opt.id);
        return (
          <button
            key={opt.id}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.id, el);
              else btnRefs.current.delete(opt.id);
            }}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`relative z-10 transition-colors duration-200 ${st.btn} ${buttonClassName} ${
              isActive ? st.activeText : st.idleText
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </WrapperTag>
  );
}

function YearPicker({ value, onChange, years = ALL_SEASON_YEARS, quickYears = QUICK_YEARS }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isCustomYear = !quickYears.includes(String(value));

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-lg">
      {quickYears.map((yr) => (
        <button
          key={yr}
          type="button"
          onClick={() => {
            onChange(yr);
            setOpen(false);
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
            String(value) === String(yr)
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {yr}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
          isCustomYear || open
            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <span className="tabular-nums">{isCustomYear ? value : 'More'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl z-50 animate-pop-in">
          <div className="px-1.5 pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>Select Season</span>
            <span className="tabular-nums">{years[years.length - 1]}–{years[0]}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 max-h-56 overflow-y-auto pr-0.5">
            {years.map((yr) => {
              const active = String(value) === String(yr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    onChange(yr);
                    setOpen(false);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold tabular-nums transition ${
                    active
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {yr}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const selected = getTeamInfo(value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groupedTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DIVISIONS.map((div) => {
      const clubs = MLB_TEAMS.filter((t) => {
        if (t.division !== div) return false;
        if (!q) return true;
        return `${t.name} ${t.abbr} ${t.short} ${t.division}`.toLowerCase().includes(q);
      }).sort((a, b) => a.name.localeCompare(b.name));
      return { division: div, clubs };
    }).filter((g) => g.clubs.length > 0);
  }, [query]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
        }}
        className={`inline-flex items-center justify-between gap-3 min-w-[235px] px-3 py-2 rounded-lg text-sm font-bold border bg-slate-50 dark:bg-slate-950 transition ${
          open
            ? 'border-sky-500 ring-2 ring-sky-500/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-sky-500/60'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-slate-900/90 dark:bg-slate-800/90 border border-slate-700/50 flex items-center justify-center p-1 shrink-0">
            <TeamLogo abbr={selected.abbr} size="xs" variant="dark" />
          </span>
          <span className="truncate">{selected.name}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180 text-sky-500' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden animate-pop-in">
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by club, city, or division..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-3">
            {groupedTeams.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No clubs match &ldquo;{query}&rdquo;</div>
            ) : (
              groupedTeams.map((grp) => (
                <div key={grp.division} className="space-y-1">
                  <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {grp.division}
                  </div>
                  <div className="space-y-0.5">
                    {grp.clubs.map((t) => {
                      const active = t.abbr === value;
                      return (
                        <button
                          key={t.abbr}
                          type="button"
                          onClick={() => {
                            onChange(t.abbr);
                            setOpen(false);
                          }}
                          className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition ${
                            active
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-slate-900/90 dark:bg-slate-950 border border-slate-700/40 flex items-center justify-center p-1 shrink-0">
                              <TeamLogo abbr={t.abbr} size="xs" variant="dark" />
                            </span>
                            <span className="text-xs font-bold truncate">{t.name}</span>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{t.abbr}</span>
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DatePickerPopover({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const [selY, selM, selD] = String(value || getLocalDateStr()).split('-').map(Number);
  const [viewYear, setViewYear] = useState(selY || 2026);
  const [viewMonth, setViewMonth] = useState((selM || 1) - 1);

  useEffect(() => {
    if (open) {
      setViewYear(selY || 2026);
      setViewMonth((selM || 1) - 1);
    }
  }, [open, selY, selM]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const displayLabel = `${shortMonths[(selM || 1) - 1]} ${selD}, ${selY}`;
  const todayStr = getLocalDateStr();

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const stepMonth = (delta) => {
    const dt = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth());
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold border bg-slate-50 dark:bg-slate-950 transition tabular-nums ${
          open
            ? 'border-sky-500 ring-2 ring-sky-500/20 text-sky-600 dark:text-sky-400'
            : 'border-slate-200 dark:border-slate-800 hover:border-sky-500'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 text-sky-500" />
        <span>{displayLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl z-50 space-y-3 animate-pop-in">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-xs font-extrabold">
              {monthNames[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="py-0.5">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = ds === value;
              const isToday = ds === todayStr;
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => {
                    onChange(ds);
                    setOpen(false);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold tabular-nums transition ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-sm'
                      : isToday
                      ? 'ring-1 ring-sky-500 text-sky-500 hover:bg-sky-500/10'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
            {[
              { label: 'Today', date: todayStr },
              { label: '2026 WS G5', date: '2026-10-28' },
              { label: 'Opening Slate', date: '2026-03-28' },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  onChange(q.date);
                  setOpen(false);
                }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-sky-600 hover:text-white transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ playerId, playerName, teamAbbr, size = 'md', rounded = 'full', className = '' }) {
  return (
    <PlayerPortrait
      playerId={playerId}
      playerName={playerName}
      teamAbbr={teamAbbr}
      size={size}
      rounded={rounded}
      className={className}
    />
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('hst_theme') !== 'light';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      try { localStorage.setItem('hst_theme', 'dark'); } catch {}
    } else {
      root.classList.remove('dark');
      try { localStorage.setItem('hst_theme', 'light'); } catch {}
    }
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState(() => {
    const t = getInitialUrlParams().get('tab');
    return ['feed', 'freeAgents', 'scoresStandings', 'leaders', 'teamHub', 'leaderboard'].includes(t) ? t : 'feed';
  });
  const [tabDirection, setTabDirection] = useState('right');
  const [, setClockTick] = useState(0);

  // Profile & Pinned Favorite Players state (mirrors hst_my_teams browser storage pattern)
  const [profileOpen, setProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(() => loadUserProfile());
  const [pinnedPlayers, setPinnedPlayers] = useState(() => loadPinnedPlayers());

  useEffect(() => {
    savePinnedPlayers(pinnedPlayers);
  }, [pinnedPlayers]);

  useEffect(() => {
    saveUserProfile(userProfile);
  }, [userProfile]);

  const pinnedPlayerIdSet = useMemo(
    () => new Set(pinnedPlayers.map((p) => Number(p.playerId))),
    [pinnedPlayers]
  );

  const profileDisplayName = getProfileDisplayName(userProfile);

  const openProfileView = () => {
    setSelectedPlayer(null);
    setCompareOpen(false);
    setSelectedGamePk(null);
    setProfileOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const togglePinnedPlayer = (candidate, e) => {
    if (e) e.stopPropagation();
    const rawId = Number(candidate?.playerId ?? candidate?.id ?? candidate?.player_id);
    if (!Number.isInteger(rawId) || rawId <= 0) return;

    setPinnedPlayers((prev) => {
      const exists = prev.some((p) => Number(p.playerId) === rawId);
      if (exists) {
        return prev.filter((p) => Number(p.playerId) !== rawId);
      }
      if (!isEligibleToPinPlayer(candidate)) {
        setSyncNotice('Only MLB players (active, retired, or historical) can be pinned — minor-league prospects are excluded.');
        return prev;
      }
      const normalized = normalizePinnedPlayer(candidate);
      if (!normalized) return prev;
      return [normalized, ...prev];
    });
  };

  const clearAllPinnedPlayers = () => {
    setPinnedPlayers([]);
  };

  const switchMainTab = (nextTab) => {
    setSelectedPlayer(null);
    setCompareOpen(false);
    setProfileOpen(false);
    setActiveTab((prev) => {
      if (prev !== nextTab) {
        const prevIdx = MAIN_TAB_ORDER.indexOf(prev);
        const nextIdx = MAIN_TAB_ORDER.indexOf(nextTab);
        setTabDirection(nextIdx >= prevIdx ? 'right' : 'left');
      }
      return nextTab;
    });
  };
  const [transactions, setTransactions] = useState([]);
  const [freeAgents, setFreeAgents] = useState([]);
  const [sidebarFreeAgents, setSidebarFreeAgents] = useState([]);
  const [selectedFaClass, setSelectedFaClass] = useState('2026');
  const [faStatMode, setFaStatMode] = useState('season');
  const [faSignedFilter, setFaSignedFilter] = useState('UNSIGNED');
  const [loadingFreeAgents, setLoadingFreeAgents] = useState(true);
  const [faSearch, setFaSearch] = useState('');

  // Global MLB Player Search state
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [globalPlayerQuery, setGlobalPlayerQuery] = useState('');
  const [globalPlayerResults, setGlobalPlayerResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncNotice, setSyncNotice] = useState('');
  const autoSyncTriggeredRef = useRef(false);

  // Scores & Standings state
  const [scoreDate, setScoreDate] = useState(() => {
    const d = getInitialUrlParams().get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : getLocalDateStr();
  });
  const [games, setGames] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [standingsSeason, setStandingsSeason] = useState('2026');
  const [standingsView, setStandingsView] = useState('divisions');
  const [standingsData, setStandingsData] = useState({ divisions: [], wildCard: [] });
  const [loadingStandings, setLoadingStandings] = useState(false);

  // League Leaders state
  const [leadersSeason, setLeadersSeason] = useState('2026');
  const [leadersGroup, setLeadersGroup] = useState('hitting');
  const [leadersData, setLeadersData] = useState({ hitting: [], pitching: [] });
  const [loadingLeaders, setLoadingLeaders] = useState(false);

  // Free Agent Watchlist
  const [watchlistIds, setWatchlistIds] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_watchlist');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  // Team Hub Roster & Injured List state
  const [hubRoster, setHubRoster] = useState(null);
  const [loadingHubRoster, setLoadingHubRoster] = useState(false);
  const [hubRosterView, setHubRosterView] = useState('depth');
  const [hubRosterSearch, setHubRosterSearch] = useState('');

  // Live Team Stats & Offseason Activity state (100% MLB Stats API — zero manual updates)
  const [spendingMode, setSpendingMode] = useState('teamStats');
  const [teamStatsSeason, setTeamStatsSeason] = useState(String(LATEST_MLB_SEASON));
  const [teamStatsGroup, setTeamStatsGroup] = useState('overview');
  const [teamStatsLeague, setTeamStatsLeague] = useState('ALL');
  const [teamStatsSearch, setTeamStatsSearch] = useState('');
  const [teamStatsSort, setTeamStatsSort] = useState({ key: 'powerRank', dir: 'asc' });
  const [teamStatsData, setTeamStatsData] = useState(null);
  const [loadingTeamStats, setLoadingTeamStats] = useState(false);
  const [spendingCycle, setSpendingCycle] = useState(OFFSEASON_CYCLES[0]);
  const [spendingApiData, setSpendingApiData] = useState(null);
  const [loadingSpending, setLoadingSpending] = useState(false);

  // Player Year-by-Year Stats Modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);

  const [lastVisit] = useState(() => {
    try {
      const prev = localStorage.getItem('hst_last_visit');
      localStorage.setItem('hst_last_visit', new Date().toISOString());
      const ts = prev ? new Date(prev).getTime() : NaN;
      return Number.isFinite(ts) ? ts : Date.now() - 1000 * 60 * 60 * 12;
    } catch {
      return Date.now() - 1000 * 60 * 60 * 12;
    }
  });

  const readStoredMyTeams = () => {
    try {
      const saved = localStorage.getItem('hst_my_teams');
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map((t) => resolveActiveTeamAbbr(t)).filter(Boolean)));
    } catch {
      return [];
    }
  };

  const [savedMyTeams, setSavedMyTeams] = useState(readStoredMyTeams);
  const [selectedTeams, setSelectedTeams] = useState(readStoredMyTeams);
  const [myTeamsOnlyActive, setMyTeamsOnlyActive] = useState(() => readStoredMyTeams().length > 0);

  const [majorLeagueOnly, setMajorLeagueOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [faPositionFilter, setFaPositionFilter] = useState('ALL');
  const [hubTeam, setHubTeam] = useState(() => {
    const tm = (getInitialUrlParams().get('team') || '').toUpperCase();
    return MLB_TEAMS.some((x) => x.abbr === tm) ? tm : 'TOR';
  });

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef(null);
  const boxScoreReqIdRef = useRef(0);
  const scoresReqIdRef = useRef(0);
  const standingsReqIdRef = useRef(0);
  const leadersReqIdRef = useRef(0);
  const faReqIdRef = useRef(0);
  const compareReqIdRef = useRef([0, 0]);
  const comparePlayersRef = useRef([null, null]);

  // Full Player Profile sub-tab / group / Savant & Splits year state
  const [profileSubTab, setProfileSubTab] = useState('overview');
  const [profileStatGroup, setProfileStatGroup] = useState('hitting');
  const [savantYear, setSavantYear] = useState('2026');
  const [splitsYear, setSplitsYear] = useState('2026');
  const [loadingSavant, setLoadingSavant] = useState(false);
  const [loadingSplits, setLoadingSplits] = useState(false);
  const profileReqIdRef = useRef(0);

  // Side-by-Side Player Comparison state
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePlayers, setComparePlayers] = useState([null, null]); // [playerA, playerB]
  useEffect(() => {
    comparePlayersRef.current = comparePlayers;
  }, [comparePlayers]);
  const [loadingCompareSlot, setLoadingCompareSlot] = useState([false, false]);
  const [compareScope, setCompareScope] = useState('career'); // 'career' | 'latest' | 'season'
  const [compareSeasonYear, setCompareSeasonYear] = useState('2026');
  const [compareStatGroup, setCompareStatGroup] = useState('hitting');
  const [compareSavantYear, setCompareSavantYear] = useState('2026');
  const [comparePickSlot, setComparePickSlot] = useState(null); // 0 or 1 when picking/replacing a player
  const [compareSearchQuery, setCompareSearchQuery] = useState('');
  const [compareSearchResults, setCompareSearchResults] = useState([]);
  const [searchingCompare, setSearchingCompare] = useState(false);

  // Live Box Score & Highlights Modal state
  const [selectedGamePk, setSelectedGamePk] = useState(null);
  const [boxScore, setBoxScore] = useState(null);
  const [loadingBoxScore, setLoadingBoxScore] = useState(false);
  const [refreshingBoxScore, setRefreshingBoxScore] = useState(false);
  const [boxScoreTeamTab, setBoxScoreTeamTab] = useState('away');
  const [copiedLink, setCopiedLink] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [recentPlayers, setRecentPlayers] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_recent_players');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => x && x.id && x.fullName) : [];
    } catch {
      return [];
    }
  });
  const skipUrlSyncRef = useRef(false);

  const openTeamHub = (abbr) => {
    const activeAbbr = resolveActiveTeamAbbr(abbr);
    if (!activeAbbr) return;
    setSelectedPlayer(null);
    setCompareOpen(false);
    setProfileOpen(false);
    setSelectedGamePk(null);
    setHubTeam(activeAbbr);
    setHubRosterSearch('');
    setActiveTab('teamHub');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleWatchlist = (playerId, playerName, e) => {
    if (e) e.stopPropagation();
    if (!playerId) return;
    setWatchlistIds((prev) => {
      const exists = prev.includes(playerId);
      const next = exists ? prev.filter((id) => id !== playerId) : [...prev, playerId];
      try { localStorage.setItem('hst_watchlist', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const openPlayerModal = async (playerId, playerName, teamAbbr) => {
    if (!playerId) return;
    const reqId = ++profileReqIdRef.current;
    setSelectedGamePk(null);
    setCompareOpen(false);
    setProfileOpen(false);
    setSelectedPlayer({ playerId, playerName, teamAbbr: resolveActiveTeamAbbr(teamAbbr) });
    setProfileSubTab('overview');
    setPlayerStats(null);
    setLoadingPlayerStats(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await fetch(`/api/player?id=${playerId}`);
      if (res.ok && profileReqIdRef.current === reqId) {
        const data = await res.json();
        setPlayerStats(data);
        setProfileStatGroup(data.isPitcher ? 'pitching' : 'hitting');
        if (data?.id && data?.fullName) {
          const activeAbbr = resolveActiveTeamAbbr(data.currentTeamAbbr);
          setRecentPlayers((prev) => {
            const entry = {
              id: data.id,
              fullName: data.fullName,
              position: data.position || 'MLB',
              teamAbbr: activeAbbr,
              active: Boolean(data.active),
              mlbDebutDate: data.mlbDebutDate || '',
              isProspect: Boolean(data.isProspect),
            };
            const next = [entry, ...prev.filter((x) => x.id !== data.id)].slice(0, 5);
            try {
              localStorage.setItem('hst_recent_players', JSON.stringify(next));
            } catch {}
            return next;
          });
          // Silently enrich stored snapshot if this player is already pinned
          setPinnedPlayers((prev) => {
            if (!prev.some((p) => Number(p.playerId) === Number(data.id))) return prev;
            return prev.map((p) =>
              Number(p.playerId) === Number(data.id)
                ? normalizePinnedPlayer({
                    ...p,
                    fullName: data.fullName,
                    position: data.position || p.position,
                    teamAbbr: activeAbbr,
                    active: Boolean(data.active),
                    mlbDebutDate: data.mlbDebutDate || p.mlbDebutDate,
                    pinnedAt: p.pinnedAt,
                  }) || p
                : p
            );
          });
        }
        if (data?.savant?.year) setSavantYear(String(data.savant.year));
        if (data?.splits?.season) setSplitsYear(String(data.splits.season));
      }
    } catch {
      // Leave null if unreachable
    } finally {
      if (profileReqIdRef.current === reqId) setLoadingPlayerStats(false);
    }
  };

  const changeSavantYear = async (yr, groupOverride = null) => {
    if (!selectedPlayer?.playerId) return;
    const reqId = ++profileReqIdRef.current;
    const grp = groupOverride || profileStatGroup;
    setSavantYear(String(yr));
    setLoadingSavant(true);
    try {
      const res = await fetch(
        `/api/player?id=${selectedPlayer.playerId}&savantYear=${encodeURIComponent(yr)}&savantGroup=${encodeURIComponent(grp)}&splitsYear=${encodeURIComponent(splitsYear)}`
      );
      if (res.ok && profileReqIdRef.current === reqId) {
        const data = await res.json();
        setPlayerStats(data);
      }
    } catch {
      // Keep existing stats
    } finally {
      if (profileReqIdRef.current === reqId) setLoadingSavant(false);
    }
  };

  const changeSplitsYear = async (yr) => {
    if (!selectedPlayer?.playerId) return;
    const reqId = ++profileReqIdRef.current;
    setSplitsYear(String(yr));
    setLoadingSplits(true);
    try {
      const res = await fetch(
        `/api/player?id=${selectedPlayer.playerId}&savantYear=${encodeURIComponent(savantYear)}&savantGroup=${encodeURIComponent(profileStatGroup)}&splitsYear=${encodeURIComponent(yr)}`
      );
      if (res.ok && profileReqIdRef.current === reqId) {
        const data = await res.json();
        setPlayerStats(data);
      }
    } catch {
      // Keep existing stats
    } finally {
      if (profileReqIdRef.current === reqId) setLoadingSplits(false);
    }
  };

  const openBoxScore = async (gamePk, { silent = false, initialTab = null } = {}) => {
    if (!gamePk) return;
    const reqId = ++boxScoreReqIdRef.current;
    if (!silent) {
      setSelectedGamePk(gamePk);
      setBoxScore(null);
      setBoxScoreTeamTab(initialTab || 'away');
      setLoadingBoxScore(true);
    } else {
      setRefreshingBoxScore(true);
    }
    try {
      const res = await fetch(`/api/season?type=boxscore&gamePk=${gamePk}`);
      if (res.ok && boxScoreReqIdRef.current === reqId) {
        const data = await res.json();
        setBoxScore(data);
      }
    } catch {
      if (!silent && boxScoreReqIdRef.current === reqId) setBoxScore(null);
    } finally {
      if (boxScoreReqIdRef.current === reqId) {
        setLoadingBoxScore(false);
        setRefreshingBoxScore(false);
      }
    }
  };

  const loadComparePlayer = async (slotIdx, playerId, savantYrOverride = null, { skipUrlPush = false } = {}) => {
    if (!playerId) return;
    const reqId = ++compareReqIdRef.current[slotIdx];
    setLoadingCompareSlot((prev) => {
      const next = [...prev];
      next[slotIdx] = true;
      return next;
    });
    try {
      const yrParam = savantYrOverride ? `&savantYear=${encodeURIComponent(savantYrOverride)}` : '';
      const res = await fetch(`/api/player?id=${playerId}${yrParam}`);
      if (res.ok && compareReqIdRef.current[slotIdx] === reqId) {
        const data = await res.json();
        if (skipUrlPush) skipUrlSyncRef.current = true;
        const other = comparePlayersRef.current[slotIdx === 0 ? 1 : 0];
        setComparePlayers((prev) => {
          const next = [...prev];
          next[slotIdx] = data;
          return next;
        });
        if (!other) {
          setCompareStatGroup(data.isPitcher ? 'pitching' : 'hitting');
        } else if (data.isPitcher && other.isPitcher) {
          setCompareStatGroup('pitching');
        } else if (!data.isPitcher && !other.isPitcher) {
          setCompareStatGroup('hitting');
        }
        if (data?.savant?.year && !savantYrOverride) {
          setCompareSavantYear(String(data.savant.year));
        }
      }
    } catch {
      // Ignore fetch failure
    } finally {
      if (compareReqIdRef.current[slotIdx] === reqId) {
        setLoadingCompareSlot((prev) => {
          const next = [...prev];
          next[slotIdx] = false;
          return next;
        });
      }
    }
  };

  const openCompareView = (initialPlayerData = null) => {
    setSelectedPlayer(null);
    setProfileOpen(false);
    setSelectedGamePk(null);
    setCompareOpen(true);
    setCompareSearchQuery('');
    setCompareSearchResults([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (initialPlayerData && initialPlayerData.id) {
      setComparePlayers([initialPlayerData, null]);
      setCompareStatGroup(initialPlayerData.isPitcher ? 'pitching' : 'hitting');
      if (initialPlayerData?.savant?.year) setCompareSavantYear(String(initialPlayerData.savant.year));
      setComparePickSlot(1);
    } else if (!comparePlayers[0]) {
      setComparePickSlot(0);
    } else if (!comparePlayers[1]) {
      setComparePickSlot(1);
    } else {
      setComparePickSlot(null);
    }
  };

  const changeCompareSavantYear = (yr) => {
    setCompareSavantYear(String(yr));
    if (comparePlayers[0]?.id) loadComparePlayer(0, comparePlayers[0].id, yr);
    if (comparePlayers[1]?.id) loadComparePlayer(1, comparePlayers[1].id, yr);
  };

  const copyShareUrl = () => {
    try {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const fetchTransactions = async (allowAutoSync = false) => {
    setLoading(true);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('reported_at', { ascending: false })
        .order('official_date', { ascending: false, nullsFirst: false })
        .order('external_id', { ascending: false })
        .limit(1000);

      const { data: meta } = await supabase
        .from('sync_metadata')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (!error && data) {
        setTransactions(data);
        const syncedIso = meta?.last_synced_at || null;
        if (syncedIso) setLastSyncedAt(syncedIso);
        setLoading(false);

        if (allowAutoSync && !autoSyncTriggeredRef.current) {
          const ageMs = syncedIso ? Date.now() - new Date(syncedIso).getTime() : Infinity;
          if (ageMs > 15 * 60 * 1000) {
            autoSyncTriggeredRef.current = true;
            handleSyncNow(false, true);
          }
        }
        return;
      } else if (error) {
        setSyncNotice(`Supabase read error: ${error.message}`);
      }
    }
    setTransactions([]);
    setLoading(false);
  };

  const fetchFreeAgents = async (classParam = selectedFaClass, modeParam = faStatMode) => {
    const reqId = ++faReqIdRef.current;
    setLoadingFreeAgents(true);
    try {
      const res = await fetch(
        `/api/free-agents?classYear=${encodeURIComponent(classParam)}&statMode=${encodeURIComponent(modeParam)}`
      );
      if (res.ok && faReqIdRef.current === reqId) {
        const data = await res.json();
        if (Array.isArray(data?.freeAgents)) {
          setFreeAgents(data.freeAgents);
          if (String(classParam) === '2026' && modeParam === 'season') {
            setSidebarFreeAgents(data.freeAgents.filter((f) => !f.isSigned));
          }
        }
      }
    } catch {
      // Leave empty
    } finally {
      if (faReqIdRef.current === reqId) setLoadingFreeAgents(false);
    }
  };

  const fetchScores = async (dateParam = scoreDate, silent = false) => {
    const reqId = ++scoresReqIdRef.current;
    if (!silent) setLoadingScores(true);
    try {
      const res = await fetch(`/api/season?type=scores&date=${encodeURIComponent(dateParam)}`);
      if (res.ok && scoresReqIdRef.current === reqId) {
        const data = await res.json();
        setGames(Array.isArray(data?.games) ? data.games : []);
      }
    } catch {
      if (!silent && scoresReqIdRef.current === reqId) setGames([]);
    } finally {
      if (!silent && scoresReqIdRef.current === reqId) setLoadingScores(false);
    }
  };

  const fetchStandings = async (seasonParam = standingsSeason) => {
    const reqId = ++standingsReqIdRef.current;
    setLoadingStandings(true);
    try {
      const res = await fetch(`/api/season?type=standings&season=${encodeURIComponent(seasonParam)}`);
      if (res.ok && standingsReqIdRef.current === reqId) {
        const data = await res.json();
        setStandingsData({
          divisions: Array.isArray(data?.divisions) ? data.divisions : [],
          wildCard: Array.isArray(data?.wildCard) ? data.wildCard : [],
        });
      }
    } catch {
      if (standingsReqIdRef.current === reqId) setStandingsData({ divisions: [], wildCard: [] });
    } finally {
      if (standingsReqIdRef.current === reqId) setLoadingStandings(false);
    }
  };

  const fetchLeaders = async (seasonParam = leadersSeason) => {
    const reqId = ++leadersReqIdRef.current;
    setLoadingLeaders(true);
    try {
      const res = await fetch(`/api/season?type=leaders&season=${encodeURIComponent(seasonParam)}`);
      if (res.ok && leadersReqIdRef.current === reqId) {
        const data = await res.json();
        setLeadersData({
          hitting: Array.isArray(data?.hitting) ? data.hitting : [],
          pitching: Array.isArray(data?.pitching) ? data.pitching : [],
        });
      }
    } catch {
      if (leadersReqIdRef.current === reqId) setLeadersData({ hitting: [], pitching: [] });
    } finally {
      if (leadersReqIdRef.current === reqId) setLoadingLeaders(false);
    }
  };

  useEffect(() => {
    fetchTransactions(true);
  }, []);

  // Open direct-linked ?player= or ?game= on first load
  useEffect(() => {
    const params = getInitialUrlParams();
    const pid = params.get('player');
    const gpk = params.get('game');
    const cmp = params.get('compare');
    const prof = params.get('profile');
    if (prof === '1') {
      skipUrlSyncRef.current = true;
      setProfileOpen(true);
    } else if (cmp) {
      skipUrlSyncRef.current = true;
      setCompareOpen(true);
      const ids = cmp.split(',').filter((x) => /^\d+$/.test(x)).slice(0, 2);
      if (ids[0]) loadComparePlayer(0, Number(ids[0]), null, { skipUrlPush: true });
      if (ids[1]) loadComparePlayer(1, Number(ids[1]), null, { skipUrlPush: true });
    } else if (pid && /^\d+$/.test(pid)) {
      skipUrlSyncRef.current = true;
      openPlayerModal(Number(pid), 'MLB Player', params.get('team') || null);
    } else if (gpk && /^\d+$/.test(gpk)) {
      skipUrlSyncRef.current = true;
      openBoxScore(Number(gpk));
    }
  }, []);

  // Keep URL query params synced for shareable links & real browser Back/Forward navigation
  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (profileOpen) {
      params.set('profile', '1');
    } else if (compareOpen) {
      const ids = [comparePlayers[0]?.id, comparePlayers[1]?.id].filter(Boolean);
      params.set('compare', ids.length > 0 ? ids.join(',') : 'open');
    } else if (selectedPlayer?.playerId) {
      params.set('player', String(selectedPlayer.playerId));
    } else if (selectedGamePk) {
      params.set('tab', 'scoresStandings');
      params.set('date', scoreDate);
      params.set('game', String(selectedGamePk));
    } else {
      if (activeTab !== 'feed') params.set('tab', activeTab);
      if (activeTab === 'teamHub') params.set('team', hubTeam);
      if (activeTab === 'scoresStandings') params.set('date', scoreDate);
    }
    const nextSearch = params.toString() ? `?${params.toString()}` : window.location.pathname;
    const currentFull = window.location.search || window.location.pathname;
    if (nextSearch !== currentFull) {
      window.history.pushState({}, '', nextSearch);
    }
  }, [activeTab, hubTeam, scoreDate, selectedPlayer?.playerId, selectedGamePk, compareOpen, profileOpen, comparePlayers[0]?.id, comparePlayers[1]?.id]);

  // Respond to browser Back / Forward buttons
  useEffect(() => {
    const onPopState = () => {
      skipUrlSyncRef.current = true;
      const params = getInitialUrlParams();
      const pid = params.get('player');
      const gpk = params.get('game');
      const tab = params.get('tab');
      const tm = (params.get('team') || '').toUpperCase();
      const dt = params.get('date');

      if (tab && ['feed', 'freeAgents', 'scoresStandings', 'leaders', 'teamHub', 'leaderboard'].includes(tab)) {
        setActiveTab(tab);
      } else if (!pid && !gpk) {
        setActiveTab('feed');
      }
      if (tm && MLB_TEAMS.some((x) => x.abbr === tm)) setHubTeam(tm);
      if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) setScoreDate(dt);

      setProfileOpen(params.get('profile') === '1');
      const cmp = params.get('compare');
      if (cmp) {
        setCompareOpen(true);
        setSelectedPlayer(null);
        const ids = cmp.split(',').filter((x) => /^\d+$/.test(x)).slice(0, 2);
        if (ids[0]) loadComparePlayer(0, Number(ids[0]), null, { skipUrlPush: true });
        if (ids[1]) loadComparePlayer(1, Number(ids[1]), null, { skipUrlPush: true });
      } else {
        setCompareOpen(false);
      }
      if (pid && /^\d+$/.test(pid)) {
        openPlayerModal(Number(pid), 'MLB Player', tm || null);
      } else {
        setSelectedPlayer(null);
      }
      if (gpk && /^\d+$/.test(gpk)) {
        openBoxScore(Number(gpk));
      } else {
        setSelectedGamePk(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Keyboard Shortcuts: "/" or Cmd/Ctrl+K to open Search Player, "Esc" to close modals / exit profile
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !isTyping)) {
        e.preventDefault();
        setPlayerSearchOpen(true);
        setGlobalPlayerQuery('');
        setGlobalPlayerResults([]);
        return;
      }

      if (e.key === 'Escape') {
        if (playerSearchOpen) {
          setPlayerSearchOpen(false);
        } else if (selectedGamePk) {
          setSelectedGamePk(null);
        } else if (mobileFilterOpen) {
          setMobileFilterOpen(false);
        } else if (teamMenuOpen) {
          setTeamMenuOpen(false);
        } else if (comparePickSlot !== null) {
          setComparePickSlot(null);
        } else if (profileOpen) {
          setProfileOpen(false);
        } else if (compareOpen) {
          setCompareOpen(false);
        } else if (selectedPlayer) {
          setSelectedPlayer(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playerSearchOpen, selectedGamePk, mobileFilterOpen, teamMenuOpen, selectedPlayer, compareOpen, comparePickSlot, profileOpen]);

  // Close desktop Team Filter dropdown when clicking outside
  useEffect(() => {
    if (!teamMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target)) {
        setTeamMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [teamMenuOpen]);

  // Track scroll position for floating Back-to-Top button
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keep "Synced: Xm ago" fresh & auto-sync silently every 15+ minutes (both while open and on tab return)
  useEffect(() => {
    const maybeAutoSync = () => {
      if (document.visibilityState !== 'visible') return;
      if (lastSyncedAt) {
        const ageMs = Date.now() - new Date(lastSyncedAt).getTime();
        if (ageMs > 15 * 60 * 1000 && !syncing) {
          handleSyncNow(false, true);
        }
      }
    };
    const tickId = setInterval(() => {
      setClockTick((t) => t + 1);
      maybeAutoSync();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setClockTick((t) => t + 1);
      maybeAutoSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tickId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [lastSyncedAt, syncing]);

  // Smart 30-second Live Auto-Polling for Scoreboard (only runs if at least 1 game is Live)
  const hasLiveGames = useMemo(() => games.some((g) => g.abstractState === 'Live'), [games]);
  useEffect(() => {
    if (activeTab !== 'scoresStandings' || !hasLiveGames) return;
    const id = setInterval(() => {
      fetchScores(scoreDate, true);
    }, 30000);
    return () => clearInterval(id);
  }, [activeTab, hasLiveGames, scoreDate]);

  // Smart 30-second Live Auto-Polling for Open Box Score Modal (only while game is Live)
  useEffect(() => {
    if (!selectedGamePk || boxScore?.abstractState !== 'Live') return;
    const id = setInterval(() => {
      openBoxScore(selectedGamePk, { silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, [selectedGamePk, boxScore?.abstractState]);

  useEffect(() => {
    fetchFreeAgents(selectedFaClass, faStatMode);
  }, [selectedFaClass, faStatMode]);

  useEffect(() => {
    const q = globalPlayerQuery.trim();
    if (q.length < 2) {
      setGlobalPlayerResults([]);
      setSearchingPlayers(false);
      return;
    }
    let cancelled = false;
    setSearchingPlayers(true);
    const timer = setTimeout(() => {
      fetch(`/api/player?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => {
          if (!cancelled) setGlobalPlayerResults(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (!cancelled) setGlobalPlayerResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingPlayers(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [globalPlayerQuery]);

  useEffect(() => {
    const q = compareSearchQuery.trim();
    if (q.length < 2) {
      setCompareSearchResults([]);
      setSearchingCompare(false);
      return;
    }
    let cancelled = false;
    setSearchingCompare(true);
    const timer = setTimeout(() => {
      fetch(`/api/player?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => {
          if (!cancelled) setCompareSearchResults(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (!cancelled) setCompareSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingCompare(false);
        });
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [compareSearchQuery]);

  useEffect(() => {
    if (activeTab === 'scoresStandings') {
      fetchScores(scoreDate);
    }
  }, [activeTab, scoreDate]);

  useEffect(() => {
    if (activeTab === 'scoresStandings') {
      fetchStandings(standingsSeason);
    }
  }, [activeTab, standingsSeason]);

  useEffect(() => {
    if (activeTab === 'leaders') {
      fetchLeaders(leadersSeason);
    }
  }, [activeTab, leadersSeason]);

  useEffect(() => {
    if (activeTab === 'teamHub' && hubTeam) {
      let cancelled = false;
      setLoadingHubRoster(true);
      fetch(`/api/season?type=roster&team=${encodeURIComponent(hubTeam)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled) setHubRoster(data);
        })
        .catch(() => {
          if (!cancelled) setHubRoster(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingHubRoster(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, hubTeam]);

  useEffect(() => {
    if ((activeTab === 'leaderboard' && spendingMode === 'teamStats') || activeTab === 'teamHub') {
      if (teamStatsData && String(teamStatsData.requestedSeason) === String(teamStatsSeason)) {
        return;
      }
      let cancelled = false;
      setLoadingTeamStats(true);
      fetch(`/api/team-stats?season=${encodeURIComponent(teamStatsSeason)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled) setTeamStatsData(data);
        })
        .catch(() => {
          if (!cancelled) setTeamStatsData(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingTeamStats(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, spendingMode, teamStatsSeason]);

  const switchTeamStatsGroup = (nextGroup) => {
    setTeamStatsGroup(nextGroup);
    if (nextGroup === 'overview') setTeamStatsSort({ key: 'powerRank', dir: 'asc' });
    else if (nextGroup === 'hitting') setTeamStatsSort({ key: 'ops', dir: 'desc' });
    else if (nextGroup === 'pitching') setTeamStatsSort({ key: 'era', dir: 'asc' });
    else if (nextGroup === 'fielding') setTeamStatsSort({ key: 'fieldingPct', dir: 'desc' });
  };

  const toggleTeamStatsSort = (key, defaultDir = 'desc') => {
    setTeamStatsSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir }
    );
  };

  useEffect(() => {
    if (activeTab === 'leaderboard' && spendingMode === 'offseason') {
      let cancelled = false;
      setLoadingSpending(true);
      fetch(`/api/spending?cycle=${encodeURIComponent(spendingCycle)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled) setSpendingApiData(data);
        })
        .catch(() => {
          if (!cancelled) setSpendingApiData(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingSpending(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, spendingMode, spendingCycle, transactions.length]);

  const handleSyncNow = async (force = false, silent = false) => {
    setSyncing(true);
    if (!silent) setSyncNotice('');
    try {
      const res = await fetch(`/api/sync${force ? '?force=true' : ''}`, { method: 'POST' });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        if (result.skipped) {
          if (!silent) setSyncNotice(`Already up to date (cooldown: ${result.remainingSeconds}s left)`);
        } else {
          if (!silent || result.addedCount > 0 || result.upgradedCount > 0) {
            setSyncNotice(result.summary || 'Synced latest MLB moves!');
          }
          await fetchTransactions(false);
        }
      } else if (!silent) {
        setSyncNotice(result.error || `Sync failed (HTTP ${res.status})`);
      }
    } catch (err) {
      if (!silent) setSyncNotice(`Sync network error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (majorLeagueOnly && !isMajorLeagueMove(tx)) return false;
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;

      const effType = getEffectiveMoveType(tx);
      if (typeFilter !== 'ALL' && effType !== typeFilter) return false;

      if (selectedTeams.length > 0) {
        const involved = [tx.to_team, tx.from_team, tx.team_a, tx.team_b].filter(Boolean);
        if (!involved.some((t) => selectedTeams.includes(t))) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const tradePlayers = [...(tx.team_a_receives || []), ...(tx.team_b_receives || [])]
          .map((p) => p?.playerName || '')
          .join(' ');
        const hay = `${decodeHtml(tx.headline)} ${tx.player_name || ''} ${tradePlayers} ${tx.to_team || ''} ${tx.from_team || ''} ${tx.team_a || ''} ${tx.team_b || ''} ${tx.contract_notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, majorLeagueOnly, statusFilter, typeFilter, selectedTeams, searchQuery]);

  const groupedTransactions = useMemo(() => {
    const groups = [];
    const byKey = new Map();
    for (const tx of filteredTransactions) {
      const key = getFeedDateKey(tx.reported_at);
      let grp = byKey.get(key);
      if (!grp) {
        grp = { key, label: formatFeedDateHeading(key), items: [] };
        byKey.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(tx);
    }
    return groups;
  }, [filteredTransactions]);

  const hasActiveFeedFilters = Boolean(
    searchQuery.trim() ||
    selectedTeams.length > 0 ||
    statusFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    !majorLeagueOnly
  );

  const resetAllFeedFilters = () => {
    setSelectedTeams([]);
    setMyTeamsOnlyActive(false);
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setSearchQuery('');
    setMajorLeagueOnly(true);
  };

  const normalizePlayerNameKey = (name) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, '')
      .replace(/[^a-z]+/g, ' ')
      .trim();

  const spendingLeaderboard = useMemo(() => {
    const totals = {};
    MLB_TEAMS.forEach((t) => {
      totals[t.abbr] = { team: t, totalMillions: 0, signingsCount: 0, totalMoves: 0 };
    });

    const maxDealBySigningKey = new Map();
    transactions.forEach((tx) => {
      if (tx.status === 'VOIDED' || !isMajorLeagueMove(tx)) return;
      const teamKey = tx.to_team || tx.team_a;
      if (teamKey && totals[teamKey]) {
        totals[teamKey].totalMoves += 1;
        if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
          totals[teamKey].signingsCount += 1;
          const val = Number(tx.total_value_millions || 0);
          if (val > 0) {
            const pKey = tx.player_name
              ? `${teamKey}:${normalizePlayerNameKey(tx.player_name)}`
              : `${teamKey}:tx:${tx.id}`;
            const prev = maxDealBySigningKey.get(pKey) || 0;
            if (val > prev) {
              totals[teamKey].totalMillions += val - prev;
              maxDealBySigningKey.set(pKey, val);
            }
          }
        }
      }
    });

    return Object.values(totals).sort(
      (a, b) =>
        b.totalMillions - a.totalMillions ||
        b.totalMoves - a.totalMoves ||
        b.signingsCount - a.signingsCount
    );
  }, [transactions]);

  const leagueStats = useMemo(() => {
    const mlbOnlyTx = transactions.filter((t) => t.status !== 'VOIDED' && isMajorLeagueMove(t));
    const totalSpent = spendingLeaderboard.reduce((sum, r) => sum + r.totalMillions, 0);
    const totalSignings = mlbOnlyTx.filter((t) => t.move_type === 'SIGNING' || t.move_type === 'EXTENSION').length;
    const totalTrades = mlbOnlyTx.filter((t) => t.move_type === 'TRADE').length;
    const mostActive = [...spendingLeaderboard].sort((a, b) => b.totalMoves - a.totalMoves)[0];
    return { totalMlbMoves: mlbOnlyTx.length, totalSpent, totalSignings, totalTrades, mostActive };
  }, [transactions, spendingLeaderboard]);

  const reportedSignedByPlayer = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    for (const tx of transactions || []) {
      if (tx.status === 'VOIDED') continue;
      if (!['SIGNING', 'EXTENSION'].includes(tx.move_type) || !tx.to_team) continue;
      const info = { team: tx.to_team, status: tx.status };
      if (tx.player_id) {
        const pid = Number(tx.player_id);
        const prev = byId.get(pid);
        if (!prev || (prev.status !== 'OFFICIAL' && info.status === 'OFFICIAL')) {
          byId.set(pid, info);
        }
      }
      if (tx.player_name) {
        const key = normalizePlayerNameKey(tx.player_name);
        const prev = byName.get(key);
        if (!prev || (prev.status !== 'OFFICIAL' && info.status === 'OFFICIAL')) {
          byName.set(key, info);
        }
      }
    }
    return { byId, byName };
  }, [transactions]);

  const effectiveSidebarFreeAgents = useMemo(() => {
    return sidebarFreeAgents.filter((fa) => {
      if (fa.isSigned) return false;
      if (fa.playerId && reportedSignedByPlayer.byId.has(Number(fa.playerId))) return false;
      if (fa.fullName && reportedSignedByPlayer.byName.has(normalizePlayerNameKey(fa.fullName))) return false;
      return true;
    });
  }, [sidebarFreeAgents, reportedSignedByPlayer]);

  const filteredFreeAgents = useMemo(() => {
    const enrichedList = freeAgents.map((fa) => {
      if (fa.isSigned) return fa;
      const match =
        (fa.playerId && reportedSignedByPlayer.byId.get(Number(fa.playerId))) ||
        (fa.fullName && reportedSignedByPlayer.byName.get(normalizePlayerNameKey(fa.fullName)));
      if (!match) return fa;
      return {
        ...fa,
        isSigned: true,
        signedTeam: fa.signedTeam || match.team,
        signedStatus: match.status,
      };
    });

    const list = enrichedList.filter((fa) => {
      if (faSignedFilter === 'UNSIGNED' && fa.isSigned) return false;
      if (faSignedFilter === 'SIGNED' && !fa.isSigned) return false;
      if (watchlistOnly && !watchlistIds.includes(fa.playerId)) return false;
      if (faPositionFilter !== 'ALL') {
        if (faPositionFilter === 'P') {
          if (!['P', 'SP', 'RP', 'RHP', 'LHP'].includes(fa.position)) return false;
        } else if (faPositionFilter === 'OF') {
          if (!['OF', 'LF', 'CF', 'RF'].includes(fa.position)) return false;
        } else if (fa.position !== faPositionFilter) {
          return false;
        }
      }
      if (faSearch.trim()) {
        const q = faSearch.toLowerCase();
        const hay = `${fa.fullName} ${fa.lastTeam} ${fa.position} ${fa.statLine}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const aPin = watchlistIds.includes(a.playerId) ? 1 : 0;
      const bPin = watchlistIds.includes(b.playerId) ? 1 : 0;
      return bPin - aPin;
    });
  }, [freeAgents, faPositionFilter, faSearch, watchlistOnly, watchlistIds, faSignedFilter]);

  const persistMyTeams = (nextTeams, { activateFilter = true, showNotice = false } = {}) => {
    const clean = Array.from(
      new Set((nextTeams || []).map((t) => resolveActiveTeamAbbr(t)).filter(Boolean))
    );
    try { localStorage.setItem('hst_my_teams', JSON.stringify(clean)); } catch {}
    setSavedMyTeams(clean);
    if (activateFilter) {
      setSelectedTeams(clean);
      setMyTeamsOnlyActive(clean.length > 0);
    } else if (clean.length === 0) {
      setMyTeamsOnlyActive(false);
    }
    if (showNotice) {
      setSyncNotice(
        clean.length > 0
          ? `Saved ${clean.join(', ')} as My Teams`
          : 'Cleared saved My Teams'
      );
    }
  };

  const toggleTeam = (abbr) => {
    const next = selectedTeams.includes(abbr)
      ? selectedTeams.filter((t) => t !== abbr)
      : [...selectedTeams, abbr];
    setSelectedTeams(next);
    if (myTeamsOnlyActive) {
      persistMyTeams(next, { activateFilter: false, showNotice: false });
    }
  };

  const selectDivision = (div) => {
    const divAbbrs = MLB_TEAMS.filter((t) => t.division === div).map((t) => t.abbr);
    setSelectedTeams(divAbbrs);
    if (myTeamsOnlyActive) {
      persistMyTeams(divAbbrs, { activateFilter: false, showNotice: false });
    }
  };

  const saveMyTeams = () => {
    persistMyTeams(selectedTeams, { activateFilter: true, showNotice: true });
    setTeamMenuOpen(false);
    setMobileFilterOpen(false);
  };

  const openTeamPickerResponsive = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileFilterOpen(true);
    } else {
      setTeamMenuOpen(true);
    }
  };

  const toggleMyTeamsQuickFilter = () => {
    if (savedMyTeams.length === 0) {
      openTeamPickerResponsive();
      return;
    }
    if (myTeamsOnlyActive) {
      setMyTeamsOnlyActive(false);
      setSelectedTeams([]);
    } else {
      setMyTeamsOnlyActive(true);
      setSelectedTeams(savedMyTeams);
    }
  };

  const exportData = (format) => {
    const content =
      format === 'json'
        ? JSON.stringify(filteredTransactions, null, 2)
        : [
            ['Status', 'Type', 'Player', 'From', 'To', 'Years', 'Total ($M)', 'AAV ($M)', 'Headline'].join(','),
            ...filteredTransactions.map((t) =>
              [
                t.status,
                getEffectiveMoveType(t),
                `"${String(t.player_name || '').replace(/"/g, '""')}"`,
                t.from_team || '',
                t.to_team || '',
                t.contract_years || '',
                t.total_value_millions || '',
                t.aav_millions || '',
                `"${decodeHtml(t.headline || '').replace(/"/g, '""')}"`,
              ].join(',')
            ),
          ].join('\n');

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mlb-offseason-tracker.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMinutesAgo = (iso) => {
    if (!iso) return 'Never synced';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins === 0) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  const isStaleRumor = (tx) => {
    if (tx.status !== 'REPORTED') return false;
    const ageDays = (Date.now() - new Date(tx.reported_at).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > 14;
  };

  const getTierBadgeStyle = (tier) => {
    if (tier === 'Elite') return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30';
    if (tier === 'Top Tier') return 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/25';
    if (tier === 'MLB Regular') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300';
    return 'bg-slate-500/15 text-slate-600 dark:text-slate-300';
  };

  return (
    <div className="min-h-screen pb-20 md:pb-12 bg-[#f4f4f2] text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogo className="w-9 h-9" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold tracking-tight text-base sm:text-lg">
                  HOT STOVE TRACKER
                </h1>

              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Year-Round MLB Dashboard • Synced: {formatMinutesAgo(lastSyncedAt)}
              </p>
            </div>
          </div>

          <SlidingSegmented
            asNav
            variant="nav"
            className="hidden lg:inline-flex h-14"
            value={activeTab}
            hiddenIndicator={Boolean(selectedPlayer || compareOpen || profileOpen)}
            onChange={switchMainTab}
            options={[
              { id: 'feed', label: 'Live Feed' },
              { id: 'freeAgents', label: `Free Agents (${effectiveSidebarFreeAgents.length || freeAgents.length})` },
              { id: 'scoresStandings', label: 'Scores & Standings' },
              { id: 'leaders', label: 'League Leaders' },
              { id: 'teamHub', label: 'Team Hub' },
              { id: 'leaderboard', label: 'Team Stats' },
            ]}
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openProfileView}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition ${
                profileOpen
                  ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-sky-500'
              }`}
              title={`Open Profile (${profileDisplayName}) & Pinned Favorite Players`}
            >
              <User className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden xl:inline text-xs">
                {userProfile?.mode === 'authenticated' && userProfile?.username ? userProfile.username : 'Profile'}
              </span>
              {pinnedPlayers.length > 0 && (
                <span className="font-stat text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                  {pinnedPlayers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => openCompareView(null)}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition ${
                compareOpen
                  ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-sky-500'
              }`}
              title="Compare any two MLB players side-by-side"
            >
              <Scale className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden xl:inline">Compare</span>
            </button>

            <button
              onClick={() => {
                setPlayerSearchOpen(true);
                setGlobalPlayerQuery('');
                setGlobalPlayerResults([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-sky-500 transition"
              title="Search any MLB player"
            >
              <Search className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden sm:inline">Search Player</span>
              <kbd className="hidden xl:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300">/</kbd>
            </button>

            <button
              onClick={() => handleSyncNow(true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm disabled:opacity-60 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle Light/Dark Mode"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>


          </div>
        </div>

        {/* Sleek Live Wire / Scoreboard Strip */}
        {(games.length > 0 || transactions.length > 0) && (
          <div className="border-t border-slate-200/70 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/80">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-8 flex items-center gap-3 overflow-x-auto no-scrollbar text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-stat font-bold uppercase tracking-wider text-[10px] text-sky-600 dark:text-sky-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {games.length > 0 ? 'MLB Scoreboard' : 'Latest Wire'}
              </span>
              <span className="h-3.5 w-px bg-slate-300 dark:bg-slate-800 shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                {games.length > 0
                  ? games.slice(0, 8).map((g) => {
                      const aw = getTeamInfo(g.away?.abbr);
                      const hm = getTeamInfo(g.home?.abbr);
                      return (
                        <button
                          key={g.gamePk}
                          type="button"
                          onClick={() => openBoxScore(g.gamePk)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/50 transition shrink-0 font-stat"
                        >
                          <TeamLogo abbr={aw.abbr} size="xs" className="!w-3.5 !h-3.5" />
                          <span className="font-bold">{aw.abbr}</span>
                          <span className="text-slate-500">{g.away?.score ?? ''}</span>
                          <span className="text-slate-400">@</span>
                          <TeamLogo abbr={hm.abbr} size="xs" className="!w-3.5 !h-3.5" />
                          <span className="font-bold">{hm.abbr}</span>
                          <span className="text-slate-500">{g.home?.score ?? ''}</span>
                          <span className="text-[9px] text-slate-400 uppercase">{g.status}</span>
                        </button>
                      );
                    })
                  : transactions
                      .filter((tx) => tx.status !== 'VOIDED' && (!majorLeagueOnly || isMajorLeagueMove(tx)))
                      .slice(0, 6)
                      .map((tx) => {
                        const club = getTeamInfo(tx.to_team || tx.from_team);
                        return (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() =>
                              tx.player_id
                                ? openPlayerModal(tx.player_id, tx.player_name, club.abbr)
                                : openTeamHub(club.abbr)
                            }
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/50 transition shrink-0"
                          >
                            <TeamLogo abbr={club.abbr} size="xs" className="!w-3.5 !h-3.5" />
                            <span className="font-stat font-bold text-[10px] text-slate-500 dark:text-slate-400">
                              {club.abbr}
                            </span>
                            <span className="font-semibold truncate max-w-[220px]">
                              {tx.player_name || decodeHtml(tx.headline)}
                            </span>
                            {tx.status === 'REPORTED' && (
                              <span className="font-stat font-extrabold text-[9px] uppercase text-amber-500">
                                RPT
                              </span>
                            )}
                            {tx.total_value_millions > 0 && (
                              <span className="font-stat font-bold text-[10px] text-emerald-500">
                                ${tx.total_value_millions}M
                              </span>
                            )}
                          </button>
                        );
                      })}
              </div>
            </div>
          </div>
        )}
      </header>

      {syncNotice && (
        <div className="bg-red-500/10 border-b border-red-500/25 px-4 py-2 text-xs font-semibold text-center text-red-700 dark:text-red-300 flex items-center justify-center gap-3">
          <span>{syncNotice}</span>
          <button
            onClick={() => setSyncNotice('')}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-6 overflow-x-clip">
        {/* PROFILE & PINNED FAVORITE PLAYERS VIEW */}
        {profileOpen ? (
          <ProfileHub
            profile={userProfile}
            pinnedPlayers={pinnedPlayers}
            savedMyTeams={savedMyTeams}
            onUpdateMyTeams={(next) => persistMyTeams(next, { activateFilter: myTeamsOnlyActive, showNotice: false })}
            onUnpinPlayer={togglePinnedPlayer}
            onClearAllPins={clearAllPinnedPlayers}
            onOpenPlayer={openPlayerModal}
            onOpenSearch={() => {
              setPlayerSearchOpen(true);
              setGlobalPlayerQuery('');
              setGlobalPlayerResults([]);
            }}
            onOpenTeamHub={openTeamHub}
            onBack={() => setProfileOpen(false)}
            TeamLogo={TeamLogo}
            getTeamBadgeStyle={getTeamBadgeStyle}
          />
        ) : compareOpen ? (() => {
          const [pA, pB] = comparePlayers;
          const isPitchCmp = compareStatGroup === 'pitching';
          const grpKey = isPitchCmp ? 'pitching' : 'hitting';

          const sharedYearsSet = new Set();
          [pA, pB].forEach((pl) => {
            (pl?.[grpKey]?.seasons || []).forEach((s) => sharedYearsSet.add(String(s.season)));
          });
          const compareYearOptions = Array.from(sharedYearsSet).sort((a, b) => Number(b) - Number(a));
          const savantYearOptions = Array.from(sharedYearsSet)
            .filter((y) => Number(y) >= 2015)
            .sort((a, b) => Number(b) - Number(a));
          const effectiveCompareSeasonYear =
            compareYearOptions.includes(String(compareSeasonYear))
              ? String(compareSeasonYear)
              : compareYearOptions[0] || String(compareSeasonYear);

          const getPlayerStatForScope = (player) => {
            if (!player) return { stat: null, label: '' };
            const blk = player[grpKey] || { seasons: [], career: null };
            if (compareScope === 'career') {
              return { stat: blk.career, label: 'Career' };
            }
            if (compareScope === 'latest') {
              const row = blk.seasons?.[0] || null;
              return { stat: row?.stat || null, label: row ? `${row.season} (${row.team})` : 'N/A' };
            }
            const match = (blk.seasons || []).find((s) => String(s.season) === effectiveCompareSeasonYear);
            return { stat: match?.stat || null, label: match ? `${match.season} (${match.team})` : `${effectiveCompareSeasonYear} (N/A)` };
          };

          const statAObj = getPlayerStatForScope(pA);
          const statBObj = getPlayerStatForScope(pB);

          const metrics = isPitchCmp
            ? [
                { key: 'era', label: 'ERA', lowerBetter: true },
                { key: 'whip', label: 'WHIP', lowerBetter: true },
                { key: 'wins', label: 'Wins (W)', lowerBetter: false },
                { key: 'losses', label: 'Losses (L)', lowerBetter: true },
                { key: 'inningsPitched', label: 'Innings Pitched', lowerBetter: false },
                { key: 'strikeOuts', label: 'Strikeouts (SO)', lowerBetter: false },
                { key: 'strikeoutsPer9Inn', label: 'K / 9', lowerBetter: false },
                { key: 'baseOnBalls', label: 'Walks (BB)', lowerBetter: true },
                { key: 'homeRuns', label: 'HR Allowed', lowerBetter: true },
                { key: 'saves', label: 'Saves (SV)', lowerBetter: false },
                { key: 'gamesPlayed', label: 'Games (G)', lowerBetter: false },
                { key: 'gamesStarted', label: 'Starts (GS)', lowerBetter: false },
              ]
            : [
                { key: 'avg', label: 'Batting Avg (AVG)', lowerBetter: false },
                { key: 'obp', label: 'On-Base % (OBP)', lowerBetter: false },
                { key: 'slg', label: 'Slugging % (SLG)', lowerBetter: false },
                { key: 'ops', label: 'OPS', lowerBetter: false },
                { key: 'homeRuns', label: 'Home Runs (HR)', lowerBetter: false },
                { key: 'rbi', label: 'RBI', lowerBetter: false },
                { key: 'runs', label: 'Runs (R)', lowerBetter: false },
                { key: 'hits', label: 'Hits (H)', lowerBetter: false },
                { key: 'doubles', label: 'Doubles (2B)', lowerBetter: false },
                { key: 'stolenBases', label: 'Stolen Bases (SB)', lowerBetter: false },
                { key: 'baseOnBalls', label: 'Walks (BB)', lowerBetter: false },
                { key: 'strikeOuts', label: 'Strikeouts (SO)', lowerBetter: true },
                { key: 'gamesPlayed', label: 'Games (G)', lowerBetter: false },
                { key: 'plateAppearances', label: 'Plate App (PA)', lowerBetter: false },
              ];

          let winsA = 0, winsB = 0, ties = 0;
          const metricRows = metrics.map((m) => {
            const rawA = statAObj.stat?.[m.key];
            const rawB = statBObj.stat?.[m.key];
            const numA = rawA !== undefined && rawA !== null && rawA !== '' ? parseFloat(rawA) : null;
            const numB = rawB !== undefined && rawB !== null && rawB !== '' ? parseFloat(rawB) : null;
            let winner = null;
            if (numA !== null && numB !== null && Number.isFinite(numA) && Number.isFinite(numB)) {
              if (Math.abs(numA - numB) < 0.0001) {
                winner = 'tie';
                ties++;
              } else if (m.lowerBetter) {
                winner = numA < numB ? 'A' : 'B';
                if (winner === 'A') winsA++; else winsB++;
              } else {
                winner = numA > numB ? 'A' : 'B';
                if (winner === 'A') winsA++; else winsB++;
              }
            }
            return { ...m, rawA: rawA ?? '—', rawB: rawB ?? '—', numA, numB, winner };
          });

          // Merge Savant percentiles across both players
          const savantMapA = new Map((pA?.savant?.percentiles || []).map((x) => [x.key, x]));
          const savantMapB = new Map((pB?.savant?.percentiles || []).map((x) => [x.key, x]));
          const savantKeys = [];
          const seenSavant = new Set();
          [...(pA?.savant?.percentiles || []), ...(pB?.savant?.percentiles || [])].forEach((x) => {
            if (!seenSavant.has(x.key)) {
              seenSavant.add(x.key);
              savantKeys.push({ key: x.key, label: x.label });
            }
          });

          const getPctPill = (val) => {
            if (val === null || val === undefined) return 'bg-slate-200 dark:bg-slate-800 text-slate-400';
            if (val >= 90) return 'bg-rose-600 text-white';
            if (val >= 70) return 'bg-orange-500 text-white';
            if (val >= 45) return 'bg-slate-500 text-white';
            if (val >= 25) return 'bg-blue-600 text-white';
            return 'bg-blue-700 text-white';
          };

          const getPctBar = (val) => {
            if (val >= 90) return 'bg-rose-600';
            if (val >= 70) return 'bg-orange-500';
            if (val >= 45) return 'bg-slate-400 dark:bg-slate-500';
            if (val >= 25) return 'bg-blue-400';
            return 'bg-blue-600';
          };

          const mismatchNotice = pA && pB && pA.isPitcher !== pB.isPitcher && !pA.isTwoWay && !pB.isTwoWay;

          return (
            <div className="space-y-5 animate-fade-up">
              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCompareOpen(false)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
                  >
                    <ArrowLeft className="w-4 h-4 text-sky-500" />
                    <span>Back</span>
                  </button>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                      <Scale className="w-5 h-5 text-sky-500" />
                      <span>Side-by-Side Player Comparison</span>
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pA && pB && (
                    <button
                      type="button"
                      onClick={() => setComparePlayers([pB, pA])}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-sky-500" />
                      <span>Swap</span>
                    </button>
                  )}
                  {pA && pB && (
                    <button
                      type="button"
                      disabled={exportingPng}
                      onClick={async () => {
                        setExportingPng(true);
                        try {
                          await exportCompareCardPng({
                            playerA: pA,
                            playerB: pB,
                            teamA: getTeamInfo(pA.currentTeamAbbr || 'MLB'),
                            teamB: getTeamInfo(pB.currentTeamAbbr || 'MLB'),
                            statAObj,
                            statBObj,
                            metricRows,
                            winsA,
                            winsB,
                            ties,
                            isPitchCmp,
                          });
                        } finally {
                          setExportingPng(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm disabled:opacity-60 transition"
                      title="Download a shareable 1200x675 PNG graphic of this comparison"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{exportingPng ? 'Rendering...' : 'Save PNG'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 text-sky-500" />}
                    <span>{copiedLink ? 'Copied!' : 'Share'}</span>
                  </button>
                </div>
              </div>

              {/* Two Player Selector / Hero Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map((slotIdx) => {
                  const pl = comparePlayers[slotIdx];
                  const isBusy = loadingCompareSlot[slotIdx];
                  const isPicking = comparePickSlot === slotIdx || !pl;
                  const tInfo = pl ? getTeamInfo(pl.currentTeamAbbr || 'MLB') : null;

                  return (
                    <div
                      key={slotIdx}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
                    >
                      {isBusy ? (
                        <BaseballLoader label={`Loading Player ${slotIdx === 0 ? 'A' : 'B'}`} compact />
                      ) : isPicking ? (
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-sky-500">
                              Select Player {slotIdx === 0 ? 'A' : 'B'}
                            </span>
                            {pl && (
                              <button
                                type="button"
                                onClick={() => setComparePickSlot(null)}
                                className="text-xs font-bold text-slate-400 hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              autoFocus={comparePickSlot === slotIdx}
                              value={compareSearchQuery}
                              onChange={(e) => {
                                setComparePickSlot(slotIdx);
                                setCompareSearchQuery(e.target.value);
                              }}
                              placeholder="Search any MLB player (e.g., Aaron Judge, Tarik Skubal)..."
                              className="w-full pl-9 pr-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>

                          <div className="max-h-56 overflow-y-auto space-y-1">
                            {compareSearchQuery.trim().length < 2 ? (
                              recentPlayers.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                                    Recent Players
                                  </div>
                                  {recentPlayers.map((rp) => {
                                    const rpTeam = getTeamInfo(rp.teamAbbr);
                                    return (
                                      <button
                                        key={rp.id}
                                        type="button"
                                        onClick={() => {
                                          setComparePickSlot(null);
                                          setCompareSearchQuery('');
                                          setCompareSearchResults([]);
                                          loadComparePlayer(slotIdx, rp.id);
                                        }}
                                        className="w-full p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-left transition"
                                      >
                                        <span className="flex items-center gap-2.5 min-w-0">
                                          <PlayerAvatar playerId={rp.id} playerName={rp.fullName} teamAbbr={rp.teamAbbr} size="sm" />
                                          <span className="text-xs font-bold truncate">
                                            {rp.fullName} <span className="text-slate-400">({rp.position})</span>
                                          </span>
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={getTeamBadgeStyle(rpTeam.color)}>
                                          {rpTeam.abbr}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="py-5 text-center text-xs text-slate-400">
                                  Type at least 2 letters to search active or historical MLB players.
                                </p>
                              )
                            ) : searchingCompare ? (
                              <BaseballLoader label="Searching MLB players" compact />
                            ) : compareSearchResults.length === 0 ? (
                              <p className="py-5 text-center text-xs text-slate-400">
                                No MLB players found for &ldquo;{compareSearchQuery}&rdquo;.
                              </p>
                            ) : (
                              compareSearchResults.map((resP) => {
                                const resTeam = getTeamInfo(resP.teamAbbr || 'MLB');
                                return (
                                  <button
                                    key={resP.id}
                                    type="button"
                                    onClick={() => {
                                      setComparePickSlot(null);
                                      setCompareSearchQuery('');
                                      setCompareSearchResults([]);
                                      loadComparePlayer(slotIdx, resP.id);
                                    }}
                                    className="w-full p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-left transition"
                                  >
                                    <span className="flex items-center gap-2.5 min-w-0">
                                      <PlayerAvatar playerId={resP.id} playerName={resP.fullName} teamAbbr={resP.teamAbbr || 'MLB'} size="sm" />
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold truncate">
                                          {resP.fullName} <span className="text-slate-400">({resP.position})</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                          {[resP.teamName, resP.age ? `Age ${resP.age}` : null, !resP.active ? 'Retired' : null].filter(Boolean).join(' • ')}
                                        </div>
                                      </div>
                                    </span>
                                    {resP.teamAbbr && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black shrink-0" style={getTeamBadgeStyle(resTeam.color)}>
                                        {resTeam.abbr}
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="relative overflow-hidden p-5 text-white"
                          style={{ background: `linear-gradient(135deg, ${tInfo.color} 0%, #0f172a 135%)` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/20 to-transparent" />
                          {pl.currentTeamAbbr && (
                            <TeamLogo
                              abbr={pl.currentTeamAbbr}
                              size="xl"
                              className="pointer-events-none absolute -right-4 -bottom-4 !w-36 !h-36 opacity-[0.14]"
                            />
                          )}
                          <div className="relative flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => openPlayerModal(pl.id, pl.fullName, pl.currentTeamAbbr || 'MLB')}
                                className="hover:scale-105 transition shrink-0"
                                title="Open full profile"
                              >
                                <PlayerAvatar playerId={pl.id} playerName={pl.fullName} teamAbbr={pl.currentTeamAbbr || 'MLB'} size="lg" />
                              </button>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-black uppercase">
                                    Player {slotIdx === 0 ? 'A' : 'B'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-bold">
                                    {pl.position}
                                  </span>
                                  {pl.currentTeamAbbr && (
                                    <span className="px-1.5 py-0.5 rounded bg-white text-slate-900 text-[10px] font-black">
                                      {pl.currentTeamAbbr}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openPlayerModal(pl.id, pl.fullName, pl.currentTeamAbbr || 'MLB')}
                                  className="text-left text-lg sm:text-xl font-black truncate block mt-0.5 hover:underline"
                                >
                                  {pl.fullName}
                                </button>
                                <div className="text-[11px] text-white/85 font-semibold mt-0.5">
                                  Age {pl.age} • B/T {pl.bats}/{pl.throws}
                                  {pl.height ? ` • ${pl.height}` : ''}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setComparePickSlot(slotIdx);
                                setCompareSearchQuery('');
                                setCompareSearchResults([]);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-black/35 hover:bg-black/55 backdrop-blur shrink-0 transition"
                            >
                              Change
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {pA && pB && (
                <>
                  {/* Comparison Controls Bar */}
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <SlidingSegmented
                        variant="surface"
                        value={compareScope}
                        onChange={setCompareScope}
                        options={[
                          { id: 'career', label: 'Career' },
                          { id: 'latest', label: 'Latest Season' },
                          { id: 'season', label: 'Pick Year' },
                        ]}
                      />

                      {compareScope === 'season' && compareYearOptions.length > 0 && (
                        <YearPicker
                          value={effectiveCompareSeasonYear}
                          onChange={setCompareSeasonYear}
                          years={compareYearOptions}
                          quickYears={compareYearOptions.slice(0, 3)}
                        />
                      )}
                    </div>

                    <SlidingSegmented
                      variant="surface"
                      value={compareStatGroup}
                      onChange={setCompareStatGroup}
                      options={[
                        { id: 'hitting', label: 'Hitting' },
                        { id: 'pitching', label: 'Pitching' },
                      ]}
                    />
                  </div>

                  {mismatchNotice && (
                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-600 dark:text-amber-300">
                      Comparing a position player ({pA.isPitcher ? pB.fullName : pA.fullName}) against a pitcher ({pA.isPitcher ? pA.fullName : pB.fullName}) — switch between Hitting and Pitching above to inspect each side.
                    </div>
                  )}

                  {/* Head-to-Head Stats Table */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                        Head-to-Head {isPitchCmp ? 'Pitching' : 'Batting'} Comparison ({statAObj.label} vs {statBObj.label})
                      </div>
                      <div className="flex items-center gap-2 text-xs font-black tabular-nums">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                          {pA.fullName.split(' ').slice(-1)[0]}: {winsA}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-400">Ties: {ties}</span>
                        <span className="text-slate-400">•</span>
                        <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500">
                          {pB.fullName.split(' ').slice(-1)[0]}: {winsB}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {metricRows.map((row) => {
                        const maxVal =
                          row.numA !== null && row.numB !== null
                            ? Math.max(Math.abs(row.numA), Math.abs(row.numB), 0.001)
                            : 1;
                        const pctA = row.numA !== null ? Math.min(100, Math.max(8, (Math.abs(row.numA) / maxVal) * 100)) : 0;
                        const pctB = row.numB !== null ? Math.min(100, Math.max(8, (Math.abs(row.numB) / maxVal) * 100)) : 0;

                        return (
                          <div key={row.key} className="px-4 sm:px-5 py-3 grid grid-cols-12 items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/35 transition">
                            <div className="col-span-4 flex items-center justify-end gap-2.5">
                              <div className="hidden sm:flex flex-1 justify-end h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                {pctA > 0 && (
                                  <div
                                    className={`h-full rounded-full ${row.winner === 'A' ? 'bg-emerald-500' : 'bg-slate-400/60 dark:bg-slate-600'}`}
                                    style={{ width: `${pctA}%` }}
                                  />
                                )}
                              </div>
                              <span
                                className={`text-sm tabular-nums ${
                                  row.winner === 'A'
                                    ? 'font-black text-emerald-500'
                                    : 'font-bold text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {row.rawA}
                              </span>
                            </div>

                            <div className="col-span-4 text-center text-[11px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-wide">
                              {row.label}
                            </div>

                            <div className="col-span-4 flex items-center gap-2.5">
                              <span
                                className={`text-sm tabular-nums ${
                                  row.winner === 'B'
                                    ? 'font-black text-sky-500'
                                    : 'font-bold text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {row.rawB}
                              </span>
                              <div className="hidden sm:flex flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                {pctB > 0 && (
                                  <div
                                    className={`h-full rounded-full ${row.winner === 'B' ? 'bg-sky-500' : 'bg-slate-400/60 dark:bg-slate-600'}`}
                                    style={{ width: `${pctB}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Head-to-Head Baseball Savant Statcast Percentiles */}
                  <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-base flex items-center gap-2">
                          <Zap className="w-4 h-4 text-rose-500" />
                          <span>Baseball Savant Statcast Head-to-Head ({compareSavantYear})</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          MLB Percentile Rankings (1–100, Blue = Poor → Red = Elite)
                        </p>
                      </div>

                      {savantYearOptions.length > 0 && (
                        <YearPicker
                          value={compareSavantYear}
                          onChange={changeCompareSavantYear}
                          years={savantYearOptions}
                          quickYears={savantYearOptions.slice(0, 3)}
                        />
                      )}
                    </div>

                    {savantKeys.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 text-center">
                        No Baseball Savant Statcast percentiles published for these players in {compareSavantYear}. Try another year (2015+) above.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {savantKeys.map((sk) => {
                          const vA = savantMapA.get(sk.key)?.value ?? null;
                          const vB = savantMapB.get(sk.key)?.value ?? null;
                          return (
                            <div key={sk.key} className="grid grid-cols-12 items-center gap-2">
                              <div className="col-span-4 flex items-center justify-end gap-2">
                                <div className="flex-1 flex justify-end h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  {vA !== null && (
                                    <div className={`h-full rounded-full ${getPctBar(vA)}`} style={{ width: `${Math.max(5, vA)}%` }} />
                                  )}
                                </div>
                                <span className={`w-8 text-center py-0.5 rounded-full text-[11px] font-black tabular-nums shrink-0 ${getPctPill(vA)}`}>
                                  {vA ?? '—'}
                                </span>
                              </div>

                              <div className="col-span-4 text-center text-[11px] font-bold text-slate-500 dark:text-slate-300 truncate">
                                {sk.label}
                              </div>

                              <div className="col-span-4 flex items-center gap-2">
                                <span className={`w-8 text-center py-0.5 rounded-full text-[11px] font-black tabular-nums shrink-0 ${getPctPill(vB)}`}>
                                  {vB ?? '—'}
                                </span>
                                <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  {vB !== null && (
                                    <div className={`h-full rounded-full ${getPctBar(vB)}`} style={{ width: `${Math.max(5, vB)}%` }} />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })() : selectedPlayer ? (() => {
          const teamInfo = getTeamInfo(playerStats?.currentTeamAbbr || selectedPlayer.teamAbbr);
          const groupKey = profileStatGroup === 'pitching' ? 'pitching' : 'hitting';
          const isPitchView = groupKey === 'pitching';
          const regBlock = playerStats?.[groupKey] || { seasons: playerStats?.seasons || [], career: playerStats?.career || null };
          const postBlock = playerStats?.postseason?.[groupKey] || { seasons: [], career: null };
          const splitRows = playerStats?.splits?.[groupKey] || [];
          const latestSeasonRow = regBlock.seasons?.[0] || null;
          const uniqueRegSeasons = new Set((regBlock.seasons || []).map((s) => s.season)).size;
          const uniquePostSeasons = new Set((postBlock.seasons || []).map((s) => s.season)).size;
          const splitSeasonOptions = (regBlock.seasons || [])
            .map((s) => String(s.season))
            .filter((y, i, arr) => arr.indexOf(y) === i)
            .slice(0, 6);
          const careerStat = regBlock.career;
          const savant = playerStats?.savant;

          const getPctBarColor = (val) => {
            if (val >= 90) return 'bg-rose-600';
            if (val >= 70) return 'bg-orange-500';
            if (val >= 45) return 'bg-slate-400 dark:bg-slate-500';
            if (val >= 25) return 'bg-blue-400';
            return 'bg-blue-600';
          };

          const getPctBadgeColor = (val) => {
            if (val >= 90) return 'bg-rose-600 text-white';
            if (val >= 70) return 'bg-orange-500 text-white';
            if (val >= 45) return 'bg-slate-500 text-white';
            if (val >= 25) return 'bg-blue-600 text-white';
            return 'bg-blue-700 text-white';
          };

          const savantYears = (regBlock.seasons || [])
            .map((s) => Number(s.season))
            .filter((y, i, arr) => Number.isFinite(y) && y >= 2015 && arr.indexOf(y) === i)
            .slice(0, 6);

          return (
            <div className="space-y-5">
              {/* Top Back Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
                >
                  <ArrowLeft className="w-4 h-4 text-sky-500" />
                  <span>Back to Tracker</span>
                </button>

                <div className="flex items-center gap-2">
                  {playerStats?.id && (
                    <button
                      onClick={() => openCompareView(playerStats)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition"
                      title="Compare this player side-by-side with another MLB player"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Compare</span>
                    </button>
                  )}
                  {playerStats?.id && (
                    <button
                      type="button"
                      disabled={exportingPng}
                      onClick={async () => {
                        setExportingPng(true);
                        try {
                          await exportPlayerCardPng({
                            playerStats,
                            teamInfo,
                            groupKey,
                            latestSeasonRow,
                            careerStat,
                            savant,
                          });
                        } finally {
                          setExportingPng(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-sky-500 disabled:opacity-60 transition"
                      title="Download a shareable 1200x675 PNG stat card for this player"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-500" />
                      <span>{exportingPng ? 'Rendering...' : 'Save PNG'}</span>
                    </button>
                  )}
                  <button
                    onClick={copyShareUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-sky-500 transition"
                    title="Copy direct link to this player profile"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 text-sky-500" />}
                    <span>{copiedLink ? 'Copied!' : 'Share'}</span>
                  </button>
                  {playerStats?.isTwoWay && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                      {[
                        { id: 'hitting', label: 'Hitting' },
                        { id: 'pitching', label: 'Pitching' },
                      ].map((g) => (
                        <button
                          key={g.id}
                          onClick={() => {
                            setProfileStatGroup(g.id);
                            changeSavantYear(savantYear, g.id);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            profileStatGroup === g.id
                              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {playerStats?.id && !playerStats?.isProspect && (
                    <button
                      onClick={(e) =>
                        togglePinnedPlayer(
                          {
                            playerId: playerStats.id,
                            fullName: playerStats.fullName,
                            position: playerStats.position,
                            teamAbbr: playerStats.currentTeamAbbr,
                            active: playerStats.active,
                            mlbDebutDate: playerStats.mlbDebutDate,
                            isProspect: playerStats.isProspect,
                          },
                          e
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition ${
                        pinnedPlayerIdSet.has(Number(playerStats.id))
                          ? 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-red-500/50'
                      }`}
                      title={pinnedPlayerIdSet.has(Number(playerStats.id)) ? 'Unpin from Profile' : 'Pin to Profile'}
                    >
                      <Pin className={`w-3.5 h-3.5 ${pinnedPlayerIdSet.has(Number(playerStats.id)) ? 'fill-current' : ''}`} />
                      <span>{pinnedPlayerIdSet.has(Number(playerStats.id)) ? 'Pinned' : 'Pin Player'}</span>
                    </button>
                  )}

                  {playerStats?.id && (
                    <button
                      onClick={(e) => toggleWatchlist(playerStats.id, playerStats.fullName, e)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition ${
                        watchlistIds.includes(playerStats.id)
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-amber-400'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${watchlistIds.includes(playerStats.id) ? 'fill-current' : ''}`} />
                      <span>{watchlistIds.includes(playerStats.id) ? 'Watchlisted' : 'Watchlist'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Hero Player Bio Banner */}
              <div
                className="relative overflow-hidden p-6 rounded-lg text-white shadow-xl border border-white/10"
                style={{ background: `linear-gradient(135deg, ${teamInfo.color} 0%, #0f172a 130%)` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/20 to-transparent" />
                {teamInfo.abbr && teamInfo.abbr !== 'MLB' && (
                  <TeamLogo
                    abbr={teamInfo.abbr}
                    size="xl"
                    className="pointer-events-none absolute -right-6 -bottom-6 !w-48 !h-48 opacity-[0.13]"
                  />
                )}
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <PlayerPortrait
                      playerId={selectedPlayer.playerId}
                      playerName={playerStats?.fullName || selectedPlayer.playerName}
                      teamAbbr={playerStats?.currentTeamAbbr || selectedPlayer.teamAbbr}
                      size="xl"
                      rounded="lg"
                      className="!border-2 !border-white/40"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {playerStats?.primaryNumber && (
                          <span className="px-2 py-0.5 rounded-md bg-white/20 text-xs font-black">
                            #{playerStats.primaryNumber}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-black/30 text-xs font-bold">
                          {playerStats?.positionName || playerStats?.position || 'MLB'}
                        </span>
                        {playerStats?.currentTeamAbbr && playerStats?.currentTeamName && (
                          <button
                            onClick={() => openTeamHub(playerStats.currentTeamAbbr)}
                            className="px-2 py-0.5 rounded-md bg-white text-slate-900 text-xs font-black hover:opacity-90"
                          >
                            {playerStats.currentTeamName}
                          </button>
                        )}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black mt-1">
                        {playerStats?.fullName || selectedPlayer.playerName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/90 font-semibold mt-1.5">
                        {playerStats?.age && <span>Age {playerStats.age}</span>}
                        {playerStats?.bats && playerStats?.throws && (
                          <span>B/T: {playerStats.bats}/{playerStats.throws}</span>
                        )}
                        {playerStats?.height && (
                          <span>{playerStats.height} • {playerStats.weight} lbs</span>
                        )}
                        {playerStats?.mlbDebutDate && (
                          <span>MLB Debut: {playerStats.mlbDebutDate}</span>
                        )}
                        {playerStats?.birthPlace && <span>From: {playerStats.birthPlace}</span>}
                      </div>
                    </div>
                  </div>

                  {playerStats?.links && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={playerStats.links.mlb}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur"
                      >
                        MLB.com <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={playerStats.links.savant}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur"
                      >
                        Baseball Savant <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={playerStats.links.bref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur"
                      >
                        Baseball-Ref <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {loadingPlayerStats ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <BaseballLoader label="Loading career stats, splits & Baseball Savant profile" />
                </div>
              ) : !playerStats ? (
                <div className="p-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-400">
                  Unable to load profile for this player right now.
                </div>
              ) : (
                <>
                  {/* Profile Sub-Navigation Tabs */}
                  <SlidingSegmented
                    variant="card"
                    value={profileSubTab}
                    onChange={setProfileSubTab}
                    options={[
                      { id: 'overview', label: 'Overview & Statcast' },
                      { id: 'seasons', label: `Year-by-Year (${uniqueRegSeasons})` },
                      { id: 'postseason', label: `Postseason (${uniquePostSeasons})` },
                      { id: 'splits', label: `Splits (${playerStats.splits?.season || ''})` },
                    ]}
                  />

                  {/* SUB-TAB 1: Overview & Baseball Savant */}
                  {profileSubTab === 'overview' && (
                    <div className="space-y-5">
                      {/* Career & Latest Season Highlight Cards */}
                      {careerStat && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {(isPitchView
                            ? [
                                { label: 'Career W-L', val: `${careerStat.wins ?? 0}-${careerStat.losses ?? 0}` },
                                { label: 'Career ERA', val: careerStat.era ?? '—', accent: true },
                                { label: 'Career WHIP', val: careerStat.whip ?? '—' },
                                { label: 'Career IP', val: careerStat.inningsPitched ?? '0.0' },
                                { label: 'Career SO', val: careerStat.strikeOuts ?? 0 },
                                { label: 'Career SV', val: careerStat.saves ?? 0 },
                              ]
                            : [
                                { label: 'Career AVG', val: careerStat.avg ?? '—' },
                                { label: 'Career OPS', val: careerStat.ops ?? '—', accent: true },
                                { label: 'Career HR', val: careerStat.homeRuns ?? 0 },
                                { label: 'Career RBI', val: careerStat.rbi ?? 0 },
                                { label: 'Career Hits', val: careerStat.hits ?? 0 },
                                { label: 'Career SB', val: careerStat.stolenBases ?? 0 },
                              ]
                          ).map((card, i) => (
                            <div
                              key={i}
                              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                            >
                              <div className="text-[11px] font-bold text-slate-400 uppercase">{card.label}</div>
                              <div className={`text-xl font-black mt-0.5 ${card.accent ? 'text-sky-500' : ''}`}>
                                {card.val}
                              </div>
                              {latestSeasonRow && (
                                <div className="text-[10px] text-slate-500 mt-1">
                                  {latestSeasonRow.season}:{' '}
                                  {isPitchView
                                    ? i === 0
                                      ? `${latestSeasonRow.stat.wins ?? 0}-${latestSeasonRow.stat.losses ?? 0}`
                                      : i === 1
                                      ? latestSeasonRow.stat.era ?? '—'
                                      : i === 2
                                      ? latestSeasonRow.stat.whip ?? '—'
                                      : i === 3
                                      ? latestSeasonRow.stat.inningsPitched ?? '0.0'
                                      : i === 4
                                      ? latestSeasonRow.stat.strikeOuts ?? 0
                                      : latestSeasonRow.stat.saves ?? 0
                                    : i === 0
                                    ? latestSeasonRow.stat.avg ?? '—'
                                    : i === 1
                                    ? latestSeasonRow.stat.ops ?? '—'
                                    : i === 2
                                    ? latestSeasonRow.stat.homeRuns ?? 0
                                    : i === 3
                                    ? latestSeasonRow.stat.rbi ?? 0
                                    : i === 4
                                    ? latestSeasonRow.stat.hits ?? 0
                                    : latestSeasonRow.stat.stolenBases ?? 0}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Baseball Savant Statcast Section (Conditional + Graceful Fallback) */}
                      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-base flex items-center gap-2">
                              <Zap className="w-4 h-4 text-rose-500" />
                              <span>Baseball Savant Statcast Profile</span>
                            </h3>
                            <p className="text-xs text-slate-500">
                              Percentile rankings (1–100, Blue = Poor → Red = Elite) &amp; Expected Stats
                            </p>
                          </div>

                          {savantYears.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                              {savantYears.map((yr) => (
                                <button
                                  key={yr}
                                  onClick={() => changeSavantYear(yr)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                    String(savantYear) === String(yr)
                                      ? 'bg-white dark:bg-slate-900 text-rose-500 shadow-sm'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {yr}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {loadingSavant ? (
                          <BaseballLoader label={`Loading ${savantYear} Statcast percentiles`} compact />
                        ) : !savant?.available ? (
                          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {savant?.reason || `No Baseball Savant Statcast percentiles published for ${savantYear} (requires Statcast era 2015+ and minimum PA/IP).`}
                            </span>
                            {playerStats.links?.savant && (
                              <a
                                href={playerStats.links.savant}
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold text-sky-500 hover:underline inline-flex items-center gap-1"
                              >
                                View on Baseball Savant <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                            {/* Percentile Sliders */}
                            {savant.percentiles?.length > 0 && (
                              <div className="lg:col-span-7 space-y-2.5">
                                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                                  {savant.year} MLB Percentile Rankings
                                </div>
                                <div className="space-y-2">
                                  {savant.percentiles.map((m) => (
                                    <div key={m.key} className="flex items-center gap-3">
                                      <span className="w-28 text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                                        {m.label}
                                      </span>
                                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                                        <div
                                          className={`h-full rounded-full animate-bar-grow ${getPctBarColor(m.value)}`}
                                          style={{ width: `${Math.max(4, m.value)}%` }}
                                        />
                                      </div>
                                      <span
                                        className={`w-8 text-center py-0.5 rounded-full text-[11px] font-black shrink-0 ${getPctBadgeColor(m.value)}`}
                                      >
                                        {m.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actual vs Expected Stats */}
                            {savant.expected && (
                              <div className={`${savant.percentiles?.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-2.5`}>
                                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                                  {savant.year} Actual vs. Expected (Statcast)
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                  {savant.expected.xera && (
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                      <div className="text-[11px] font-bold text-slate-400">ERA vs xERA</div>
                                      <div className="text-base font-black mt-0.5">
                                        {savant.expected.era || '—'} <span className="text-slate-400 text-xs">vs</span>{' '}
                                        <span className="text-rose-500">{savant.expected.xera}</span>
                                      </div>
                                    </div>
                                  )}
                                  {savant.expected.xba && (
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                      <div className="text-[11px] font-bold text-slate-400">BA vs xBA</div>
                                      <div className="text-base font-black mt-0.5">
                                        {savant.expected.ba || '—'} <span className="text-slate-400 text-xs">vs</span>{' '}
                                        <span className="text-sky-500">{savant.expected.xba}</span>
                                      </div>
                                    </div>
                                  )}
                                  {savant.expected.xslg && (
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                      <div className="text-[11px] font-bold text-slate-400">SLG vs xSLG</div>
                                      <div className="text-base font-black mt-0.5">
                                        {savant.expected.slg || '—'} <span className="text-slate-400 text-xs">vs</span>{' '}
                                        <span className="text-sky-500">{savant.expected.xslg}</span>
                                      </div>
                                    </div>
                                  )}
                                  {savant.expected.xwoba && (
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                      <div className="text-[11px] font-bold text-slate-400">wOBA vs xwOBA</div>
                                      <div className="text-base font-black mt-0.5">
                                        {savant.expected.woba || '—'} <span className="text-slate-400 text-xs">vs</span>{' '}
                                        <span className="text-rose-500">{savant.expected.xwoba}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {savant.expected.pa && (
                                  <p className="text-[11px] text-slate-400">
                                    Sample: {savant.expected.pa} PA / {savant.expected.bip ?? 0} Batted Balls in Play
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2 & 3: Regular Season or Postseason Full Year-by-Year Table */}
                  {(profileSubTab === 'seasons' || profileSubTab === 'postseason') && (() => {
                    const activeSet = profileSubTab === 'postseason' ? postBlock : regBlock;
                    return (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <h3 className="font-extrabold text-sm">
                            {profileSubTab === 'postseason' ? 'MLB Postseason' : 'MLB Regular Season'} {isPitchView ? 'Pitching' : 'Batting'} Stats
                          </h3>
                          <span className="text-xs text-slate-400">{profileSubTab === 'postseason' ? uniquePostSeasons : uniqueRegSeasons} Seasons</span>
                        </div>
                        {activeSet.seasons.length === 0 ? (
                          <div className="p-10 text-center text-xs text-slate-400">
                            No {profileSubTab === 'postseason' ? 'postseason' : 'regular-season'} MLB {isPitchView ? 'pitching' : 'batting'} stats recorded.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase bg-slate-50/70 dark:bg-slate-950/60">
                                  <th className="py-2.5 pl-4 pr-3 font-bold">Year</th>
                                  <th className="py-2.5 pr-3 font-bold">Team</th>
                                  {isPitchView ? (
                                    <>
                                      <th className="py-2.5 px-2 font-bold text-right">W-L</th>
                                      <th className="py-2.5 px-2 font-bold text-right">ERA</th>
                                      <th className="py-2.5 px-2 font-bold text-right">G</th>
                                      <th className="py-2.5 px-2 font-bold text-right">GS</th>
                                      <th className="py-2.5 px-2 font-bold text-right">SV</th>
                                      <th className="py-2.5 px-2 font-bold text-right">IP</th>
                                      <th className="py-2.5 px-2 font-bold text-right">H</th>
                                      <th className="py-2.5 px-2 font-bold text-right">ER</th>
                                      <th className="py-2.5 px-2 font-bold text-right">HR</th>
                                      <th className="py-2.5 px-2 font-bold text-right">BB</th>
                                      <th className="py-2.5 px-2 font-bold text-right">SO</th>
                                      <th className="py-2.5 px-2 font-bold text-right">WHIP</th>
                                      <th className="py-2.5 pr-4 pl-2 font-bold text-right">K/9</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="py-2.5 px-2 font-bold text-right">G</th>
                                      <th className="py-2.5 px-2 font-bold text-right">PA</th>
                                      <th className="py-2.5 px-2 font-bold text-right">AB</th>
                                      <th className="py-2.5 px-2 font-bold text-right">R</th>
                                      <th className="py-2.5 px-2 font-bold text-right">H</th>
                                      <th className="py-2.5 px-2 font-bold text-right">2B</th>
                                      <th className="py-2.5 px-2 font-bold text-right">3B</th>
                                      <th className="py-2.5 px-2 font-bold text-right">HR</th>
                                      <th className="py-2.5 px-2 font-bold text-right">RBI</th>
                                      <th className="py-2.5 px-2 font-bold text-right">BB</th>
                                      <th className="py-2.5 px-2 font-bold text-right">SO</th>
                                      <th className="py-2.5 px-2 font-bold text-right">SB</th>
                                      <th className="py-2.5 px-2 font-bold text-right">AVG</th>
                                      <th className="py-2.5 px-2 font-bold text-right">OBP</th>
                                      <th className="py-2.5 px-2 font-bold text-right">SLG</th>
                                      <th className="py-2.5 pr-4 pl-2 font-bold text-right">OPS</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {activeSet.seasons.map((row, i) => (
                                  <tr
                                    key={`${row.season}-${i}`}
                                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                                      String(row.team).includes('TM') ? 'bg-sky-500/5 font-semibold' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 pl-4 pr-3 font-extrabold">{row.season}</td>
                                    <td className="py-2.5 pr-3 font-semibold text-slate-500">{row.team}</td>
                                    {isPitchView ? (
                                      <>
                                        <td className="py-2.5 px-2 text-right">{row.stat.wins ?? 0}-{row.stat.losses ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right font-bold text-sky-600 dark:text-sky-400">{row.stat.era ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.gamesPlayed ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.gamesStarted ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.saves ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.inningsPitched ?? '0.0'}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.hits ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.earnedRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.homeRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.baseOnBalls ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right font-bold">{row.stat.strikeOuts ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.whip ?? '—'}</td>
                                        <td className="py-2.5 pr-4 pl-2 text-right">{row.stat.strikeoutsPer9Inn ?? '—'}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="py-2.5 px-2 text-right">{row.stat.gamesPlayed ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.plateAppearances ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.atBats ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.runs ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.hits ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.doubles ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.triples ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right font-bold">{row.stat.homeRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.rbi ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.baseOnBalls ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.strikeOuts ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.stolenBases ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right font-bold">{row.stat.avg ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.obp ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{row.stat.slg ?? '—'}</td>
                                        <td className="py-2.5 pr-4 pl-2 text-right font-bold text-sky-600 dark:text-sky-400">{row.stat.ops ?? '—'}</td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                                {activeSet.career && (
                                  <tr className="bg-slate-100/80 dark:bg-slate-800/70 font-extrabold">
                                    <td className="py-2.5 pl-4 pr-3">Career</td>
                                    <td className="py-2.5 pr-3 text-slate-500">MLB</td>
                                    {isPitchView ? (
                                      <>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.wins ?? 0}-{activeSet.career.losses ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right text-sky-600 dark:text-sky-400">{activeSet.career.era ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.gamesPlayed ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.gamesStarted ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.saves ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.inningsPitched ?? '0.0'}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.hits ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.earnedRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.homeRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.baseOnBalls ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.strikeOuts ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.whip ?? '—'}</td>
                                        <td className="py-2.5 pr-4 pl-2 text-right">{activeSet.career.strikeoutsPer9Inn ?? '—'}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.gamesPlayed ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.plateAppearances ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.atBats ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.runs ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.hits ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.doubles ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.triples ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.homeRuns ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.rbi ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.baseOnBalls ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.strikeOuts ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.stolenBases ?? 0}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.avg ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.obp ?? '—'}</td>
                                        <td className="py-2.5 px-2 text-right">{activeSet.career.slg ?? '—'}</td>
                                        <td className="py-2.5 pr-4 pl-2 text-right text-sky-600 dark:text-sky-400">{activeSet.career.ops ?? '—'}</td>
                                      </>
                                    )}
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUB-TAB 4: Situational Splits */}
                  {profileSubTab === 'splits' && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-extrabold text-sm">
                            {playerStats.splits?.season || splitsYear} Situational Splits (Home / Away / vs L / vs R)
                          </h3>
                          {isPitchView && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Season totals across all clubs played • MLB does not assign ERA to handedness (vs L / vs R) splits
                            </p>
                          )}
                        </div>

                        {splitSeasonOptions.length > 1 && (
                          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            {splitSeasonOptions.map((yr) => (
                              <button
                                key={yr}
                                onClick={() => changeSplitsYear(yr)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                  String(playerStats.splits?.season || splitsYear) === String(yr)
                                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {yr}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {loadingSplits ? (
                        <BaseballLoader label={`Loading ${splitsYear} situational splits`} compact />
                      ) : splitRows.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-400">
                          No situational split data available for {playerStats.splits?.season || splitsYear}.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase bg-slate-50/70 dark:bg-slate-950/60">
                                <th className="py-2.5 pl-4 pr-3 font-bold">Split</th>
                                {isPitchView ? (
                                  <>
                                    <th className="py-2.5 px-2 font-bold text-right">IP</th>
                                    <th className="py-2.5 px-2 font-bold text-right">ERA</th>
                                    <th className="py-2.5 px-2 font-bold text-right">WHIP</th>
                                    <th className="py-2.5 px-2 font-bold text-right">AVG</th>
                                    <th className="py-2.5 px-2 font-bold text-right">OBP</th>
                                    <th className="py-2.5 px-2 font-bold text-right">SLG</th>
                                    <th className="py-2.5 px-2 font-bold text-right">OPS</th>
                                    <th className="py-2.5 px-2 font-bold text-right">HR</th>
                                    <th className="py-2.5 px-2 font-bold text-right">BB</th>
                                    <th className="py-2.5 pr-4 pl-2 font-bold text-right">SO</th>
                                  </>
                                ) : (
                                  <>
                                    <th className="py-2.5 px-2 font-bold text-right">AB</th>
                                    <th className="py-2.5 px-2 font-bold text-right">H</th>
                                    <th className="py-2.5 px-2 font-bold text-right">HR</th>
                                    <th className="py-2.5 px-2 font-bold text-right">RBI</th>
                                    <th className="py-2.5 px-2 font-bold text-right">BB</th>
                                    <th className="py-2.5 px-2 font-bold text-right">SO</th>
                                    <th className="py-2.5 px-2 font-bold text-right">AVG</th>
                                    <th className="py-2.5 px-2 font-bold text-right">OBP</th>
                                    <th className="py-2.5 px-2 font-bold text-right">SLG</th>
                                    <th className="py-2.5 pr-4 pl-2 font-bold text-right">OPS</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                              {splitRows.map((sp, i) => (
                                <tr key={`${sp.code}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-2.5 pl-4 pr-3 font-extrabold">
                                    <span>{sp.label}</span>
                                    {sp.team && String(sp.team).includes('TM') && (
                                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-500">
                                        {sp.team}
                                      </span>
                                    )}
                                  </td>
                                  {isPitchView ? (
                                    <>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.inningsPitched ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right font-bold text-sky-600 dark:text-sky-400">{sp.stat.era ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.whip ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.avg ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.obp ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.slg ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right font-bold">{sp.stat.ops ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.homeRuns ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.baseOnBalls ?? 0}</td>
                                      <td className="py-2.5 pr-4 pl-2 text-right font-bold">{sp.stat.strikeOuts ?? 0}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.atBats ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.hits ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right font-bold">{sp.stat.homeRuns ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.rbi ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.baseOnBalls ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.strikeOuts ?? 0}</td>
                                      <td className="py-2.5 px-2 text-right font-bold">{sp.stat.avg ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.obp ?? '—'}</td>
                                      <td className="py-2.5 px-2 text-right">{sp.stat.slg ?? '—'}</td>
                                      <td className="py-2.5 pr-4 pl-2 text-right font-bold text-sky-600 dark:text-sky-400">{sp.stat.ops ?? '—'}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })() : (
        <div key={activeTab} className={tabDirection === 'left' ? 'animate-slide-in-left' : 'animate-slide-in-right'}>


        {activeTab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search player, team, or contract..."
                      className="w-full pl-9 pr-8 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={toggleMyTeamsQuickFilter}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold border transition ${
                      myTeamsOnlyActive && savedMyTeams.length > 0
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-amber-500/50'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${myTeamsOnlyActive && savedMyTeams.length > 0 ? 'fill-current' : ''}`} />
                    <span>
                      {savedMyTeams.length > 0 ? `My Teams (${savedMyTeams.length})` : 'Set My Teams'}
                    </span>
                  </button>

                  <div ref={teamMenuRef} className="relative hidden md:block">
                    <button
                      type="button"
                      onClick={() => setTeamMenuOpen(!teamMenuOpen)}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border bg-slate-50 dark:bg-slate-950 transition ${
                        teamMenuOpen
                          ? 'border-sky-500 ring-2 ring-sky-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-sky-500'
                      }`}
                    >
                      <Filter className="w-4 h-4 text-sky-500" />
                      <span>
                        {selectedTeams.length === 0
                          ? 'All 30 Teams'
                          : `Teams (${selectedTeams.length})`}
                      </span>
                    </button>

                    {teamMenuOpen && (
                      <div className="absolute right-0 mt-2 w-[430px] p-4 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl z-40 animate-pop-in space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              {myTeamsOnlyActive ? 'Editing My Teams (Auto-Saving)' : 'Filter Teams & Division Presets'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTeams([]);
                              if (myTeamsOnlyActive) {
                                persistMyTeams([], { activateFilter: false, showNotice: false });
                              }
                            }}
                            className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition"
                          >
                            Clear Filter
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {DIVISIONS.map((div) => (
                            <button
                              key={div}
                              type="button"
                              onClick={() => selectDivision(div)}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-sky-500 hover:text-white transition"
                            >
                              {div}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                          {MLB_TEAMS.map((t) => {
                            const active = selectedTeams.includes(t.abbr);
                            const isSaved = savedMyTeams.includes(t.abbr);
                            return (
                              <button
                                key={t.abbr}
                                type="button"
                                onClick={() => toggleTeam(t.abbr)}
                                title={isSaved ? `${t.name} (in My Teams)` : t.name}
                                className={`relative px-2 py-1.5 rounded-lg text-xs font-bold border transition ${
                                  active
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                                }`}
                              >
                                {t.abbr}
                                {isSaved && (
                                  <span
                                    aria-hidden="true"
                                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={saveMyTeams}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition"
                          >
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span>
                              {selectedTeams.length > 0
                                ? `Save as My Teams (${selectedTeams.length})`
                                : savedMyTeams.length > 0
                                ? 'Clear Saved My Teams'
                                : 'Save as My Teams'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTeamMenuOpen(false)}
                            className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 transition"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setMobileFilterOpen(true)}
                    className="md:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  >
                    <Filter className="w-4 h-4 text-sky-500" />
                    <span>
                      Filters{selectedTeams.length ? ` (${selectedTeams.length})` : ''}
                    </span>
                  </button>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={majorLeagueOnly}
                      onChange={(e) => setMajorLeagueOnly(e.target.checked)}
                      className="rounded text-sky-600 focus:ring-sky-500"
                    />
                    <span>MLB Only</span>
                  </label>

                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      onClick={() => exportData('csv')}
                      title="Export CSV"
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button
                      onClick={() => exportData('json')}
                      title="Export JSON"
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    >
                      JSON
                    </button>
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                  <SlidingSegmented
                    variant="underline"
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                      { id: 'ALL', label: 'All Moves' },
                      { id: 'SIGNING', label: 'Signings' },
                      { id: 'TRADE', label: 'Trades' },
                      { id: 'EXTENSION', label: 'Extensions' },
                      { id: 'FREE_AGENCY', label: 'Free Agency' },
                      { id: 'INJURED_LIST', label: 'Injured List' },
                      { id: 'CALLUP_OPTION', label: 'Call-Ups / Options' },
                      { id: 'DFA_WAIVER', label: 'DFAs & Waivers' },
                    ]}
                  />
                  <SlidingSegmented
                    variant="surface"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { id: 'ALL', label: 'All' },
                      { id: 'OFFICIAL', label: 'Official' },
                      { id: 'REPORTED', label: 'Reported' },
                    ]}
                  />
                </div>

                {/* Live Feed Result Counter & Removable Active Filter Chips */}
                {!loading && transactions.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                        Showing <strong className="text-slate-800 dark:text-slate-100">{filteredTransactions.length}</strong> of {transactions.length} moves
                      </span>

                      {searchQuery.trim() && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-300 hover:bg-sky-500/25 transition"
                        >
                          <span>&ldquo;{searchQuery.trim()}&rdquo;</span>
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {selectedTeams.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeams([]);
                            setMyTeamsOnlyActive(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 transition"
                        >
                          <span>
                            Teams: {selectedTeams.length <= 3 ? selectedTeams.join(', ') : `${selectedTeams.length} selected`}
                          </span>
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {statusFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('ALL')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:opacity-80 transition"
                        >
                          <span>Status: {statusFilter === 'OFFICIAL' ? 'Official' : 'Reported'}</span>
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {typeFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setTypeFilter('ALL')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-300 hover:bg-sky-500/25 transition"
                        >
                          <span>{MOVE_TYPE_LABELS[typeFilter] || typeFilter}</span>
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {!majorLeagueOnly && (
                        <button
                          type="button"
                          onClick={() => setMajorLeagueOnly(true)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/25 transition"
                        >
                          <span>Including MiLB</span>
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {hasActiveFeedFilters && (
                      <button
                        type="button"
                        onClick={resetAllFeedFilters}
                        className="text-[11px] font-extrabold text-rose-500 hover:underline shrink-0"
                      >
                        Reset All
                      </button>
                    )}
                  </div>
                )}
              </div>

              {loading ? (
                <FeedSkeleton />
              ) : transactions.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
                  <p className="font-bold text-base text-slate-700 dark:text-slate-200">
                    No MLB transactions in your database yet
                  </p>
                  <button
                    onClick={() => handleSyncNow(true)}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white shadow"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    <span>{syncing ? 'Syncing Live MLB Data...' : 'Pull Live MLB Moves Now'}</span>
                  </button>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <p className="font-semibold text-slate-500">No transactions match your current filters.</p>
                  <button
                    onClick={resetAllFeedFilters}
                    className="mt-2 text-xs font-bold text-sky-500 hover:underline"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedTransactions.map((dateGroup) => (
                    <section key={dateGroup.key} className="space-y-3">
                      <div className="sticky top-[88px] z-20 flex items-center gap-3 py-1 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-sm">
                          <Calendar className="w-3 h-3 text-sky-500" />
                          <span>{dateGroup.label}</span>
                        </span>
                        <div className="flex-1 h-px bg-slate-200/80 dark:bg-slate-800/80" />
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                          {dateGroup.items.length} {dateGroup.items.length === 1 ? 'move' : 'moves'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {dateGroup.items.map((tx) => {
                    const destTeam = getTeamInfo(tx.to_team || tx.from_team);
                    const isNew = new Date(tx.reported_at).getTime() > lastVisit;
                    const stale = isStaleRumor(tx);
                    const cleanHeadline = decodeHtml(tx.headline);
                    const cleanNotes = decodeHtml(tx.contract_notes);
                    const effType = getEffectiveMoveType(tx);
                    const isWatchlisted = tx.player_id && watchlistIds.includes(tx.player_id);
                    const isFeedPlayerPinned = tx.player_id && pinnedPlayerIdSet.has(Number(tx.player_id));
                    const canPinFeedPlayer = isEligibleToPinPlayer({
                      playerId: tx.player_id,
                      fullName: tx.player_name,
                      is_major_league: tx.is_major_league,
                    });
                    const badgeLabel =
                      effType === 'FREE_AGENCY'
                        ? 'FREE AGENCY'
                        : effType === 'INJURED_LIST'
                        ? 'INJURED LIST'
                        : effType === 'CALLUP_OPTION'
                        ? 'CALL-UP / OPTION'
                        : effType.replace('_', ' ');

                    const isReportedArticleCard = tx.status === 'REPORTED' && Boolean(tx.source_url);
                    return (
                      <article
                        key={tx.id}
                        onClick={
                          isReportedArticleCard
                            ? (e) => {
                                if (e.target.closest('a, button')) return;
                                window.open(tx.source_url, '_blank', 'noopener,noreferrer');
                              }
                            : undefined
                        }
                        className={`relative overflow-hidden p-4 sm:p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition ${
                          isReportedArticleCard ? 'cursor-pointer hover:border-sky-500/40' : ''
                        }`}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ backgroundColor: destTeam.color }}
                        />
                        <div className="pl-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {tx.status === 'OFFICIAL' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> OFFICIAL
                                </span>
                              )}
                              {tx.status === 'REPORTED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                  <Clock className="w-3.5 h-3.5" /> REPORTED
                                </span>
                              )}
                              {tx.status === 'VOIDED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500/15 text-rose-500">
                                  <ShieldAlert className="w-3.5 h-3.5" /> VOIDED
                                </span>
                              )}

                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                                  effType === 'FREE_AGENCY'
                                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                                    : effType === 'INJURED_LIST'
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    : effType === 'CALLUP_OPTION'
                                    ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {badgeLabel}
                              </span>

                              {!tx.is_major_league && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-500">
                                  MiLB
                                </span>
                              )}

                              {isNew && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500 text-white">
                                  NEW
                                </span>
                              )}

                              {isFeedPlayerPinned && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/15 text-red-600 dark:text-red-400">
                                  <Pin className="w-2.5 h-2.5 fill-current" /> PINNED
                                </span>
                              )}

                              {isWatchlisted && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                                  <Star className="w-2.5 h-2.5 fill-current" /> WATCHLIST
                                </span>
                              )}

                              {stale && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-500">
                                  <AlertTriangle className="w-3 h-3" /> Pending &gt;14d
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              {tx.source_url ? (
                                <a
                                  href={tx.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-sky-400 transition"
                                >
                                  <span>{tx.source_name}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span>{tx.source_name}</span>
                              )}
                              <span>•</span>
                              <span>{new Date(tx.reported_at).toLocaleDateString()}</span>

                            </div>
                          </div>

                          {tx.move_type === 'TRADE' && (tx.team_a_receives?.length || tx.team_b_receives?.length) ? (
                            <div>
                              <h2 className="font-bold text-base mb-3">{cleanHeadline}</h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                  { teamAbbr: tx.team_a, list: tx.team_a_receives || [] },
                                  { teamAbbr: tx.team_b, list: tx.team_b_receives || [] },
                                ].map((side, idx) => {
                                  const tInfo = getTeamInfo(side.teamAbbr);
                                  return (
                                    <div
                                      key={idx}
                                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60"
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <button
                                          onClick={() => openTeamHub(tInfo.abbr)}
                                          className="px-2 py-0.5 rounded text-xs font-black hover:opacity-85 transition shadow-sm"
                                          style={getTeamBadgeStyle(tInfo.color)}
                                          title={`Open ${tInfo.name} Team Hub`}
                                        >
                                          {tInfo.abbr}
                                        </button>
                                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                          {tInfo.short} Receive
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {side.list.map((p, i) => {
                                          const canPinLeg = isEligibleToPinPlayer({
                                            playerId: p.playerId,
                                            fullName: p.playerName,
                                            is_major_league: tx.is_major_league,
                                            isProspect: p.isProspect === true || p.level === 'MiLB',
                                          });
                                          const legPinned = p.playerId && pinnedPlayerIdSet.has(Number(p.playerId));
                                          return (
                                            <div
                                              key={i}
                                              className="flex items-center justify-between gap-2 rounded-lg p-1 -m-1 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => openPlayerModal(p.playerId, p.playerName, side.teamAbbr)}
                                                className={`flex-1 min-w-0 flex items-center gap-2.5 text-left ${
                                                  p.playerId ? 'cursor-pointer' : 'cursor-default'
                                                }`}
                                              >
                                                <PlayerAvatar
                                                  playerId={p.playerId}
                                                  playerName={p.playerName}
                                                  teamAbbr={side.teamAbbr}
                                                  size="sm"
                                                />
                                                <div className="text-sm font-bold flex items-center gap-1.5 min-w-0">
                                                  <span className={`truncate ${p.playerId ? 'hover:text-sky-500' : ''}`}>{p.playerName}</span>
                                                  <span className="text-[11px] font-semibold px-1.5 rounded bg-slate-200 dark:bg-slate-800 shrink-0">
                                                    {p.position}
                                                  </span>
                                                </div>
                                              </button>
                                              {canPinLeg && (
                                                <button
                                                  type="button"
                                                  onClick={(e) =>
                                                    togglePinnedPlayer(
                                                      {
                                                        playerId: p.playerId,
                                                        fullName: p.playerName,
                                                        position: p.position,
                                                        teamAbbr: side.teamAbbr,
                                                        active: true,
                                                        is_major_league: tx.is_major_league,
                                                      },
                                                      e
                                                    )
                                                  }
                                                  title={legPinned ? `Unpin ${p.playerName}` : `Pin ${p.playerName} to Profile`}
                                                  aria-label={legPinned ? `Unpin ${p.playerName}` : `Pin ${p.playerName}`}
                                                  className={`p-1.5 rounded-lg border shrink-0 transition ${
                                                    legPinned
                                                      ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400'
                                                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-500/40'
                                                  }`}
                                                >
                                                  <Pin className={`w-3 h-3 ${legPinned ? 'fill-current' : ''}`} />
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-start sm:items-center gap-3.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (tx.player_id) openPlayerModal(tx.player_id, tx.player_name, destTeam.abbr);
                                  }}
                                  className={tx.player_id ? 'cursor-pointer hover:scale-105 transition' : 'cursor-default'}
                                  title={tx.player_id ? 'View player profile & stats' : undefined}
                                >
                                  <PlayerAvatar
                                    playerId={tx.player_id}
                                    playerName={tx.player_name}
                                    teamAbbr={destTeam.abbr}
                                  />
                                </button>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openTeamHub(destTeam.abbr)}
                                      className="px-2 py-0.5 rounded text-xs font-black shrink-0 hover:opacity-85 transition shadow-sm"
                                      style={getTeamBadgeStyle(destTeam.color)}
                                      title={`View ${destTeam.name} Hub`}
                                    >
                                      {destTeam.abbr}
                                    </button>
                                    {isReportedArticleCard ? (
                                      <a
                                        href={tx.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-bold text-sm sm:text-base leading-snug hover:text-sky-500 transition inline-flex items-center gap-1.5"
                                        title={`Read article on ${tx.source_name || 'source'}`}
                                      >
                                        <span>{cleanHeadline}</span>
                                        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                      </a>
                                    ) : (
                                      <h2
                                        onClick={() => tx.player_id && openPlayerModal(tx.player_id, tx.player_name, destTeam.abbr)}
                                        className={`font-bold text-sm sm:text-base leading-snug ${
                                          tx.player_id ? 'cursor-pointer hover:text-sky-500 transition' : ''
                                        }`}
                                      >
                                        {cleanHeadline}
                                      </h2>
                                    )}
                                  </div>
                                  {(tx.position || tx.stat_line || cleanNotes || tx.player_id) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      {tx.position && (
                                        <span className="font-bold text-slate-700 dark:text-slate-200">
                                          {tx.position}
                                        </span>
                                      )}
                                      {tx.stat_line && (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                          {tx.stat_line}
                                        </span>
                                      )}
                                      {cleanNotes && <span className="line-clamp-1">{cleanNotes}</span>}
                                      {tx.player_id && (
                                        <button
                                          type="button"
                                          onClick={() => openPlayerModal(tx.player_id, tx.player_name, destTeam.abbr)}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-500 hover:underline"
                                        >
                                          <BarChart3 className="w-3 h-3" /> Stats
                                        </button>
                                      )}
                                      {canPinFeedPlayer && (
                                        <button
                                          type="button"
                                          onClick={(e) =>
                                            togglePinnedPlayer(
                                              {
                                                playerId: tx.player_id,
                                                fullName: tx.player_name,
                                                position: tx.position,
                                                headline: cleanHeadline,
                                                teamAbbr: tx.to_team || tx.from_team,
                                                active: true,
                                                is_major_league: tx.is_major_league,
                                              },
                                              e
                                            )
                                          }
                                          title={isFeedPlayerPinned ? 'Unpin from Profile' : 'Pin to Profile'}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border transition ${
                                            isFeedPlayerPinned
                                              ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400'
                                              : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-red-500/50 hover:text-red-500'
                                          }`}
                                        >
                                          <Pin className={`w-3 h-3 ${isFeedPlayerPinned ? 'fill-current' : ''}`} />
                                          <span>{isFeedPlayerPinned ? 'Pinned' : 'Pin'}</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {(tx.contract_years || tx.total_value_millions > 0) && (
                                <div className="flex sm:flex-col items-end justify-end gap-1 shrink-0">
                                  <span className="px-3 py-1 rounded-lg text-xs sm:text-sm font-extrabold bg-sky-500/15 text-sky-700 dark:text-sky-300">
                                    {tx.contract_years ? `${tx.contract_years} yr${tx.contract_years > 1 ? 's' : ''}` : ''}
                                    {tx.contract_years && tx.total_value_millions ? ' / ' : ''}
                                    {tx.total_value_millions ? `$${tx.total_value_millions}M` : ''}
                                  </span>
                                  {tx.aav_millions > 0 && (
                                    <span className="text-[11px] font-semibold text-slate-400">
                                      ${tx.aav_millions}M AAV
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4 sticky top-24">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <Activity className="w-4 h-4 text-sky-500" />
                  <span>Hot Stove Pulse</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black text-sky-500">{leagueStats.totalMlbMoves}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">MLB Moves</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black text-emerald-500">
                      ${leagueStats.totalSpent.toFixed(1)}M
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold">Tracked Deals</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black">{leagueStats.totalSignings}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">Signings</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black">{leagueStats.totalTrades}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">Trades</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Most Active Clubs
                  </span>
                  <button
                    onClick={() => {
                      setSpendingMode('offseason');
                      setActiveTab('leaderboard');
                    }}
                    className="text-xs font-bold text-sky-500 hover:underline"
                  >
                    View all
                  </button>
                </div>
                <div className="space-y-2">
                  {spendingLeaderboard.slice(0, 8).map((row) => (
                    <button
                      key={row.team.abbr}
                      onClick={() => openTeamHub(row.team.abbr)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 transition text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-slate-900 border border-white/10 flex items-center justify-center p-0.5 shrink-0">
                          <TeamLogo abbr={row.team.abbr} size="xs" />
                        </span>
                        <span className="text-xs font-bold">{row.team.short}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-extrabold">
                          {row.totalMillions > 0 ? `$${row.totalMillions.toFixed(1)}M` : `${row.totalMoves} moves`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Top Unsigned Free Agents
                  </span>
                  <button
                    onClick={() => setActiveTab('freeAgents')}
                    className="text-xs font-bold text-sky-500 hover:underline"
                  >
                    See all
                  </button>
                </div>
                {loadingFreeAgents && effectiveSidebarFreeAgents.length === 0 ? (
                  <p className="text-xs text-slate-400">Loading MLB free agents...</p>
                ) : effectiveSidebarFreeAgents.length === 0 ? (
                  <p className="text-xs text-slate-400">No unsigned free agents listed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {effectiveSidebarFreeAgents.slice(0, 6).map((fa) => (
                      <button
                        key={fa.playerId}
                        type="button"
                        onClick={() => openPlayerModal(fa.playerId, fa.fullName, fa.lastTeam)}
                        className="w-full flex items-center gap-2.5 p-1.5 -mx-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left transition"
                      >
                        <PlayerAvatar
                          playerId={fa.playerId}
                          playerName={fa.fullName}
                          teamAbbr={fa.lastTeam}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">
                            {fa.fullName} <span className="text-slate-400">({fa.position})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{fa.statLine}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'freeAgents' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">{selectedFaClass} MLB Free Agent Class</h2>
                  <p className="text-xs text-slate-500">
                    {selectedFaClass} offseason free agents • Showing {faStatMode === 'career' ? 'Career MLB' : `${selectedFaClass} MLB`} stats
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <YearPicker
                    value={selectedFaClass}
                    years={FA_CLASS_YEARS}
                    onChange={(yr) => {
                      setSelectedFaClass(yr);
                      setFaSignedFilter(yr === '2026' ? 'UNSIGNED' : 'ALL');
                    }}
                  />

                  <SlidingSegmented
                    variant="surface"
                    value={faStatMode}
                    onChange={setFaStatMode}
                    buttonClassName="!px-2.5"
                    options={[
                      { id: 'season', label: `${selectedFaClass} Stats` },
                      { id: 'career', label: 'Career' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={faSearch}
                      onChange={(e) => setFaSearch(e.target.value)}
                      placeholder="Search free agents by name or team..."
                      className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    {faSearch && (
                      <button
                        type="button"
                        onClick={() => setFaSearch('')}
                        aria-label="Clear free agent search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setWatchlistOnly((w) => !w)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      watchlistOnly
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${watchlistOnly ? 'fill-current' : ''}`} />
                    <span>Watchlist ({watchlistIds.length})</span>
                  </button>
                  <SlidingSegmented
                    variant="surface"
                    value={faSignedFilter}
                    onChange={setFaSignedFilter}
                    buttonClassName="!px-2.5 !text-[11px]"
                    options={[
                      { id: 'ALL', label: 'All' },
                      { id: 'UNSIGNED', label: 'Unsigned' },
                      { id: 'SIGNED', label: 'Signed' },
                    ]}
                  />
                </div>

              </div>

              <SlidingSegmented
                variant="underline"
                value={faPositionFilter}
                onChange={setFaPositionFilter}
                options={['ALL', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].map((pos) => ({
                  id: pos,
                  label: pos === 'ALL' ? 'All Positions' : pos,
                }))}
              />

              {!loadingFreeAgents && freeAgents.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    Showing <strong className="text-slate-800 dark:text-slate-100">{filteredFreeAgents.length}</strong> of {freeAgents.length} {selectedFaClass} free agents
                  </span>
                  {(faSearch.trim() || faPositionFilter !== 'ALL' || watchlistOnly || faSignedFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFaSearch('');
                        setFaPositionFilter('ALL');
                        setWatchlistOnly(false);
                        setFaSignedFilter('ALL');
                      }}
                      className="text-[11px] font-extrabold text-rose-500 hover:underline"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {loadingFreeAgents ? (
              <CardsGridSkeleton
                count={9}
                label={`Scouting ${selectedFaClass} MLB free agents`}
              />
            ) : filteredFreeAgents.length === 0 ? (
              <div className="text-center py-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <p className="text-sm font-semibold text-slate-500">
                  No matching {faSignedFilter === 'SIGNED' ? 'signed' : faSignedFilter === 'UNSIGNED' ? 'unsigned' : ''} free agents found.
                </p>
                <button
                  onClick={() => {
                    setWatchlistOnly(false);
                    setFaPositionFilter('ALL');
                    setFaSearch('');
                    setFaSignedFilter('ALL');
                  }}
                  className="text-xs font-bold text-sky-500 hover:underline"
                >
                  Clear Free Agent Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredFreeAgents.map((fa, idx) => {
                  const prevTeam = getTeamInfo(fa.lastTeam);
                  const pinned = watchlistIds.includes(fa.playerId);
                  const statCells = parseStatLineCells(fa.statLine);
                  return (
                    <div
                      key={fa.playerId || idx}
                      onClick={() => openPlayerModal(fa.playerId, fa.fullName, fa.lastTeam)}
                      className={`group rounded-lg border bg-white dark:bg-slate-900 flex flex-col justify-between hover:border-sky-500/50 cursor-pointer transition shadow-sm overflow-hidden ${
                        pinned ? 'border-amber-500/45' : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="p-3.5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar
                            playerId={fa.playerId}
                            playerName={fa.fullName}
                            teamAbbr={fa.lastTeam}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm sm:text-[15px] flex items-center gap-1.5 group-hover:text-sky-500 transition-colors">
                              <span className="truncate">{fa.fullName}</span>
                              <span className="font-stat text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                {fa.position}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                              <span className="font-stat text-[11px]">Age {fa.age}</span>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamHub(prevTeam.abbr);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:border-sky-500/40 border border-transparent text-[10px] font-stat font-bold text-slate-700 dark:text-slate-200 transition"
                                title="Previous club"
                              >
                                <TeamLogo abbr={prevTeam.abbr} size="xs" className="!w-3.5 !h-3.5" />
                                <span>{prevTeam.abbr}</span>
                              </button>
                              {fa.isSigned && fa.signedTeam && (() => {
                                const newTeamInfo = getTeamInfo(fa.signedTeam);
                                return (
                                  <>
                                    <span className="text-[10px] font-bold text-slate-400">→</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTeamHub(newTeamInfo.abbr);
                                      }}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-stat font-bold hover:opacity-85 transition ${
                                        fa.signedStatus === 'REPORTED'
                                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                          : 'bg-emerald-500/15 text-emerald-500'
                                      }`}
                                      title={
                                        fa.signedStatus === 'REPORTED'
                                          ? `Reported agreement with ${newTeamInfo.name}`
                                          : `Signed with ${newTeamInfo.name}`
                                      }
                                    >
                                      <TeamLogo abbr={newTeamInfo.abbr} size="xs" className="!w-3.5 !h-3.5" />
                                      <span>{newTeamInfo.abbr}</span>
                                      {fa.signedStatus === 'REPORTED' && (
                                        <span className="text-[9px] uppercase tracking-wider opacity-90">
                                          (Reported)
                                        </span>
                                      )}
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => toggleWatchlist(fa.playerId, fa.fullName, e)}
                            title={pinned ? 'Remove from Watchlist' : 'Star to Watchlist'}
                            className={`p-1.5 rounded-lg border transition ${
                              pinned
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                                : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-amber-400'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${pinned ? 'fill-current' : ''}`} />
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-stat font-bold uppercase tracking-wide ${getTierBadgeStyle(fa.tier)}`}
                          >
                            {fa.tier}
                          </span>
                        </div>
                      </div>

                      {/* Monospace Scouting Stat Strip */}
                      {statCells.length >= 2 ? (
                        <div
                          className="grid border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 divide-x divide-slate-200/70 dark:divide-slate-800"
                          style={{ gridTemplateColumns: `repeat(${statCells.length}, minmax(0, 1fr))` }}
                        >
                          {statCells.map((cell, cIdx) => (
                            <div key={cIdx} className="px-2.5 py-1.5 text-center">
                              <div className="font-stat text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">
                                {cell.val}
                              </div>
                              <div className="font-stat text-[9px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                                {cell.lbl}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3.5 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 font-stat text-[11px] text-slate-500 truncate">
                          {fa.statLine}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Scores & Standings Tab */}
        {activeTab === 'scoresStandings' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-sky-500" />
                    <span>MLB Scoreboard &amp; Schedule</span>
                    {hasLiveGames && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE AUTO-REFRESH
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Spring Training, Regular Season &amp; Postseason scores with probable pitchers and decisions
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setScoreDate((d) => shiftDateStr(d, -1))}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <DatePickerPopover value={scoreDate} onChange={setScoreDate} />
                  <button
                    onClick={() => setScoreDate((d) => shiftDateStr(d, 1))}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    title="Next Day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setScoreDate(getLocalDateStr())}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white hover:bg-sky-500"
                  >
                    Today
                  </button>
                </div>
              </div>

              {loadingScores ? (
                <CardsGridSkeleton count={6} label={`Loading MLB scoreboard for ${scoreDate}`} />
              ) : games.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      No MLB games scheduled for {scoreDate}
                    </p>
                    <p className="text-xs text-slate-400">
                      Jump to a recent 2026 showcase date to inspect Box Scores, Scoring Plays &amp; Official Video Highlights:
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_JUMP_DATES.map((q) => (
                      <button
                        key={q.date}
                        onClick={() => setScoreDate(q.date)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-sky-600 hover:text-white transition"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {games.map((g) => {
                    const awayInfo = getTeamInfo(g.away.abbr);
                    const homeInfo = getTeamInfo(g.home.abbr);
                    const isLive = g.abstractState === 'Live';
                    const isFinal = g.abstractState === 'Final';
                    const awayWon = isFinal && (g.away.score ?? 0) > (g.home.score ?? 0);
                    const homeWon = isFinal && (g.home.score ?? 0) > (g.away.score ?? 0);
                    const startTime = g.gameDate
                      ? new Date(g.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : g.status;

                    return (
                      <div
                        key={g.gamePk}
                        onClick={() => openBoxScore(g.gamePk)}
                        className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500/60 cursor-pointer shadow-sm space-y-3 transition group"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              isLive
                                ? 'bg-rose-500/15 text-rose-500'
                                : isFinal
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                            }`}
                          >
                            {isLive && g.inning ? `${g.inningHalf || ''} ${g.inning}` : isFinal ? g.status : startTime}
                          </span>
                          <span className="text-slate-400 truncate max-w-[170px]">{g.venue}</span>
                        </div>

                        <div className="space-y-2">
                          {[
                            { side: g.away, info: awayInfo, won: awayWon },
                            { side: g.home, info: homeInfo, won: homeWon },
                          ].map(({ side, info, won }, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamHub(info.abbr);
                                }}
                                className="flex items-center gap-2.5 text-left hover:opacity-85"
                              >
                                <span className="w-8 h-8 rounded-lg bg-slate-900/90 dark:bg-slate-950 border border-slate-700/40 flex items-center justify-center p-1 shrink-0 shadow-sm">
                                  <TeamLogo abbr={info.abbr} size="sm" />
                                </span>
                                <div>
                                  <div className={`text-sm font-bold ${won ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {info.short}
                                  </div>
                                  {side.wins !== null && (
                                    <div className="text-[10px] text-slate-400">
                                      ({side.wins}-{side.losses})
                                    </div>
                                  )}
                                </div>
                              </button>
                              <div className={`text-lg font-black ${won ? 'text-sky-500' : 'text-slate-400'}`}>
                                {side.score !== null ? side.score : '—'}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <div className="truncate">
                            {isFinal && g.decisions?.winner ? (
                              <span>
                                W: <strong className="text-slate-700 dark:text-slate-200">{g.decisions.winner}</strong>
                                {g.decisions.loser && ` • L: ${g.decisions.loser}`}
                                {g.decisions.save && ` • SV: ${g.decisions.save}`}
                              </span>
                            ) : (g.away.probablePitcher || g.home.probablePitcher) ? (
                              <span>
                                Probables: {g.away.probablePitcher || 'TBD'} vs {g.home.probablePitcher || 'TBD'}
                              </span>
                            ) : (
                              <span>{g.status}</span>
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-sky-500 group-hover:underline shrink-0">
                            Box Score & Highlights →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">MLB Standings</h2>
                  <p className="text-xs text-slate-500">
                    Regular-season Division &amp; Wild Card standings ({standingsSeason})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SlidingSegmented
                    variant="surface"
                    value={standingsView}
                    onChange={setStandingsView}
                    options={[
                      { id: 'divisions', label: 'Divisions' },
                      { id: 'wildCard', label: 'Wild Card' },
                    ]}
                  />

                  <YearPicker value={standingsSeason} onChange={setStandingsSeason} />
                </div>
              </div>

              {loadingStandings ? (
                <StandingsSkeleton label={`Loading ${standingsSeason} MLB standings`} />
              ) : (
                <div className={`grid grid-cols-1 ${standingsView === 'wildCard' ? 'lg:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3'} gap-4`}>
                  {(standingsView === 'wildCard' ? standingsData.wildCard : standingsData.divisions).map((group, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/60">
                        <h3 className="font-extrabold text-sm">
                          {group.divisionName || group.leagueName}
                        </h3>
                        <span className="text-[11px] font-bold text-slate-400">{standingsSeason}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 uppercase">
                              <th className="py-2 pl-4 pr-2 font-bold">Team</th>
                              <th className="py-2 px-1.5 font-bold text-right">W</th>
                              <th className="py-2 px-1.5 font-bold text-right">L</th>
                              <th className="py-2 px-1.5 font-bold text-right">PCT</th>
                              <th className="py-2 px-1.5 font-bold text-right">GB</th>
                              <th className="py-2 px-1.5 font-bold text-right">L10</th>
                              <th className="py-2 pr-4 pl-1.5 font-bold text-right">DIFF</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {(group.teams || []).map((t, tIdx) => {
                              const tInfo = getTeamInfo(t.abbr);
                              const wcCutoffIdx = getWcCutoffIndex(standingsSeason);
                              const isWcCutoff = standingsView === 'wildCard' && wcCutoffIdx >= 0 && tIdx === wcCutoffIdx;
                              return (
                                <tr
                                  key={t.abbr}
                                  onClick={() => openTeamHub(t.abbr)}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition ${
                                    isWcCutoff ? 'border-b-2 border-b-sky-500/60' : ''
                                  }`}
                                >
                                  <td className="py-2.5 pl-4 pr-2 font-bold flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-lg bg-slate-900/90 dark:bg-slate-950 border border-slate-700/40 flex items-center justify-center p-0.5 shrink-0">
                                      <TeamLogo abbr={tInfo.abbr} size="xs" />
                                    </span>
                                    <span className="truncate">{tInfo.short}</span>
                                    {t.clinchIndicator && (
                                      <span className="text-[10px] font-black px-1.5 rounded bg-emerald-500/15 text-emerald-500">
                                        {t.clinchIndicator}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-1.5 text-right font-bold">{t.wins}</td>
                                  <td className="py-2.5 px-1.5 text-right text-slate-500">{t.losses}</td>
                                  <td className="py-2.5 px-1.5 text-right font-semibold">{t.pct}</td>
                                  <td className="py-2.5 px-1.5 text-right text-slate-400">
                                    {standingsView === 'wildCard' ? t.wcGb : t.gb}
                                  </td>
                                  <td className="py-2.5 px-1.5 text-right text-slate-400">{t.lastTen}</td>
                                  <td
                                    className={`py-2.5 pr-4 pl-1.5 text-right font-bold ${
                                      t.runDiff > 0
                                        ? 'text-emerald-500'
                                        : t.runDiff < 0
                                        ? 'text-rose-500'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {t.runDiff > 0 ? `+${t.runDiff}` : t.runDiff}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* League Leaders Tab */}
        {activeTab === 'leaders' && (
          <div className="space-y-4 animate-fade-up">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div>
                <h2 className="text-xl font-extrabold flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span>MLB League Leaders ({leadersSeason})</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Official MLB Stats API top-10 leaderboards (2000–2026) • Click any player for full career &amp; Statcast profile
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SlidingSegmented
                  variant="surface"
                  value={leadersGroup}
                  onChange={setLeadersGroup}
                  options={[
                    { id: 'hitting', label: 'Hitting' },
                    { id: 'pitching', label: 'Pitching' },
                  ]}
                />

                <YearPicker value={leadersSeason} onChange={setLeadersSeason} />
              </div>
            </div>

            {loadingLeaders ? (
              <LeadersSkeleton label={`Loading ${leadersSeason} MLB ${leadersGroup} leaders`} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[...(leadersData[leadersGroup] || [])]
                  .sort((a, b) => (LEADER_ORDER[a.category] || 99) - (LEADER_ORDER[b.category] || 99))
                  .map((board) => {
                    const list = board.leaders || [];
                    const topPlayer = list[0];
                    const topTeam = topPlayer ? getTeamInfo(topPlayer.teamAbbr) : null;
                    const rankCounts = {};
                    list.forEach((x) => {
                      rankCounts[x.rank] = (rankCounts[x.rank] || 0) + 1;
                    });
                    const isTopTied = topPlayer && rankCounts[topPlayer.rank] > 1;

                    return (
                      <div
                        key={board.category}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition"
                      >
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between">
                          <h3 className="font-extrabold text-sm">
                            {formatLeaderCategory(board.category)}
                          </h3>
                          <span className="text-[11px] font-bold text-slate-400 tabular-nums">{leadersSeason}</span>
                        </div>

                        {topPlayer && (
                          <div
                            onClick={() => openPlayerModal(topPlayer.playerId, topPlayer.fullName, topPlayer.teamAbbr)}
                            className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-sky-500/5 hover:bg-sky-500/10 cursor-pointer transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <PlayerAvatar
                                playerId={topPlayer.playerId}
                                playerName={topPlayer.fullName}
                                teamAbbr={topPlayer.teamAbbr}
                              />
                              <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-wide text-amber-500">
                                  {isTopTied ? 'T-#1 Leader' : '#1 Leader'}
                                </div>
                                <div className="font-extrabold text-sm truncate">{topPlayer.fullName}</div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTeamHub(topTeam.abbr);
                                  }}
                                  className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-black shadow-sm hover:opacity-85"
                                  style={getTeamBadgeStyle(topTeam.color)}
                                  title={`Open ${topTeam.name} Hub`}
                                >
                                  {topTeam.abbr}
                                </button>
                              </div>
                            </div>
                            <div className="text-2xl font-black text-sky-500 shrink-0 tabular-nums">
                              {topPlayer.value}
                            </div>
                          </div>
                        )}

                        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                          {list.slice(1, 10).map((item, idx) => {
                            const tInfo = getTeamInfo(item.teamAbbr);
                            const isTied = rankCounts[item.rank] > 1;
                            return (
                              <div
                                key={`${item.playerId}-${idx}`}
                                onClick={() => openPlayerModal(item.playerId, item.fullName, item.teamAbbr)}
                                className="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-7 font-bold text-slate-400 tabular-nums shrink-0">
                                    {isTied ? `T-${item.rank}` : `${item.rank}.`}
                                  </span>
                                  <span className="font-bold truncate">{item.fullName}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTeamHub(tInfo.abbr);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 shadow-sm hover:opacity-85"
                                    style={getTeamBadgeStyle(tInfo.color)}
                                    title={`Open ${tInfo.name} Hub`}
                                  >
                                    {tInfo.abbr}
                                  </button>
                                </div>
                                <span className="font-extrabold text-slate-700 dark:text-slate-200 ml-2 tabular-nums">
                                  {item.value}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Team Hub Tab — Broadcast-Quality Clubhouse & Transaction Hub */}
        {activeTab === 'teamHub' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div>
                <h2 className="text-xl font-extrabold">30-Team Clubhouse &amp; Transaction Hub</h2>
                <p className="text-xs text-slate-500">Official roster, payroll breakdown, Injured List, depth chart &amp; offseason moves</p>
              </div>
              <TeamDropdown
                value={hubTeam}
                onChange={(abbr) => {
                  setHubTeam(abbr);
                  setHubRosterSearch('');
                }}
              />
            </div>

            {(() => {
              const info = getTeamInfo(hubTeam);
              const mlbClubId = getMlbTeamId(hubTeam);
              const isDepartureMove = (t) => {
                const h = (t.headline || '').toLowerCase();
                return (
                  isFreeAgencyElection(t) ||
                  h.includes('released') ||
                  h.includes('non-tendered') ||
                  h.includes('designated for assignment')
                );
              };
              const additions = transactions.filter(
                (t) =>
                  t.status !== 'VOIDED' &&
                  (!majorLeagueOnly || isMajorLeagueMove(t)) &&
                  (t.to_team === hubTeam || t.team_a === hubTeam) &&
                  !isDepartureMove(t)
              );
              const subtractions = transactions.filter(
                (t) =>
                  t.status !== 'VOIDED' &&
                  (!majorLeagueOnly || isMajorLeagueMove(t)) &&
                  (t.from_team === hubTeam ||
                    t.team_b === hubTeam ||
                    (t.to_team === hubTeam && isDepartureMove(t)))
              );

              // Live official MLB Team Stats & Ranks for this club (zero manual updates)
              const hubTeamStats = teamStatsData?.teams?.find((t) => t.abbr === hubTeam) || null;
              const hubStatsSeason = teamStatsData?.season || teamStatsSeason;

              const rosterQuery = hubRosterSearch.trim().toLowerCase();
              const matchesRosterSearch = (p) =>
                !rosterQuery ||
                `${p.fullName} ${p.position} #${p.jerseyNumber || ''}`.toLowerCase().includes(rosterQuery);

              return (
                <div className="space-y-4">
                  {/* Redesigned Pro Clubhouse Hero Banner */}
                  <div
                    className="relative overflow-hidden p-6 sm:p-7 rounded-lg text-white shadow-xl border border-white/10"
                    style={{
                      background: `linear-gradient(135deg, ${info.color} 0%, #0f172a 128%)`,
                    }}
                  >
                    {/* Atmospheric Gradient Overlays & Oversized Watermark Logo */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'radial-gradient(circle at 12% 18%, rgba(255,255,255,0.18) 0%, transparent 48%), linear-gradient(90deg, rgba(2,6,23,0.42) 0%, rgba(2,6,23,0.18) 55%, rgba(2,6,23,0.52) 100%)',
                      }}
                    />
                    <TeamLogo
                      abbr={info.abbr}
                      size="xl"
                      className="pointer-events-none absolute -right-6 -bottom-8 !w-52 !h-52 sm:!w-64 sm:!h-64 opacity-[0.13]"
                    />

                    <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Left: Glass Logo Medallion + Club Name + Record Pills */}
                      <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-white/10 backdrop-blur-md border border-white/25 p-2.5 sm:p-3 flex items-center justify-center shadow-2xl shrink-0">
                          <TeamLogo abbr={info.abbr} size="xl" className="!w-full !h-full drop-shadow-lg" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-white/15 backdrop-blur-sm border border-white/15 text-[10px] font-black uppercase tracking-widest">
                              {info.division}
                            </span>
                            {hubTeamStats?.ranks?.power > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-black/30 text-[10px] font-bold tracking-wide text-white/90 tabular-nums">
                                #{hubTeamStats.ranks.power} MLB Power Rank
                              </span>
                            )}
                            {hubTeamStats?.ranks?.ops > 0 && hubTeamStats?.ranks?.era > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-black/25 text-[10px] font-semibold tracking-wide text-white/85 tabular-nums">
                                #{hubTeamStats.ranks.ops} Off • #{hubTeamStats.ranks.era} Pitch
                              </span>
                            )}
                          </div>

                          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-1 truncate drop-shadow-sm">
                            {info.name}
                          </h3>

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {hubRoster?.record && (
                              <>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 backdrop-blur-sm border border-white/10 text-xs font-extrabold tabular-nums">
                                  <span className="text-white/70">{hubRoster.record.season}</span>
                                  <span>{hubRoster.record.wins}-{hubRoster.record.losses}</span>
                                  <span className="text-sky-300">({hubRoster.record.pct})</span>
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-black/25 border border-white/10 text-xs font-bold">
                                  Div #{hubRoster.record.divRank}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-black/25 border border-white/10 text-xs font-bold">
                                  Streak {hubRoster.record.streak}
                                </span>
                                {hubRoster.record.runDiff !== undefined && (
                                  <span
                                    className={`px-2.5 py-1 rounded-lg bg-black/25 border border-white/10 text-xs font-extrabold tabular-nums ${
                                      hubRoster.record.runDiff > 0
                                        ? 'text-emerald-300'
                                        : hubRoster.record.runDiff < 0
                                        ? 'text-rose-300'
                                        : 'text-white/80'
                                    }`}
                                  >
                                    Diff {hubRoster.record.runDiff > 0 ? `+${hubRoster.record.runDiff}` : hubRoster.record.runDiff}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Frosted Glass Stat Tiles + Quick Actions */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-3 shrink-0">
                        <div className="grid grid-cols-3 gap-2.5">
                          {[
                            { val: hubRoster?.activeCount ?? '—', label: hubRoster?.rosterSource || 'Roster' },
                            { val: hubRoster?.ilCount ?? 0, label: 'On IL' },
                            { val: additions.length + subtractions.length, label: 'Offseason Moves' },
                          ].map((tile, idx) => (
                            <div
                              key={idx}
                              className="px-3.5 py-2.5 rounded-lg bg-black/25 backdrop-blur-md border border-white/15 text-center min-w-[84px]"
                            >
                              <div className="text-xl sm:text-2xl font-black tabular-nums leading-tight">{tile.val}</div>
                              <div className="text-[10px] font-bold text-white/75 mt-0.5 whitespace-nowrap">{tile.label}</div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={copyShareUrl}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/15 transition"
                          >
                            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
                            <span>{copiedLink ? 'Copied!' : 'Share Club'}</span>
                          </button>
                          {mlbClubId && (
                            <a
                              href={`https://www.mlb.com/team/${mlbClubId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/15 transition"
                            >
                              <span>MLB.com</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live MLB Team Season Stats & League Ranks */}
                  {(() => {
                    const liveTeamAdd = spendingLeaderboard.find((r) => r.team.abbr === hubTeam)?.totalMillions || 0;
                    const rankBarColor = (rank) => {
                      if (!rank) return '#64748b';
                      if (rank <= 7) return '#10b981';
                      if (rank <= 15) return '#0ea5e9';
                      if (rank <= 23) return '#f59e0b';
                      return '#f43f5e';
                    };
                    const rankBarWidth = (rank) => {
                      if (!rank) return 10;
                      return Math.max(8, Math.round(((31 - rank) / 30) * 100));
                    };

                    return (
                      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="font-extrabold text-base flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-sky-500" />
                              <span>{info.short} Team Stats &amp; MLB Ranks ({hubStatsSeason})</span>
                            </h4>
                            <p className="text-xs text-slate-500">
                              Live official MLB Stats API offense, pitching, defense &amp; run differential rankings
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {liveTeamAdd > 0 && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-500 tabular-nums">
                                +${liveTeamAdd.toFixed(1)}M Offseason Deals
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSpendingMode('teamStats');
                                setActiveTab('leaderboard');
                              }}
                              className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/15 hover:text-sky-500 text-slate-600 dark:text-slate-300 transition"
                            >
                              All 30 Teams →
                            </button>
                          </div>
                        </div>

                        {loadingTeamStats && !hubTeamStats ? (
                          <BaseballLoader label={`Loading ${hubStatsSeason} ${info.short} team stats`} compact />
                        ) : !hubTeamStats ? (
                          <p className="text-xs text-slate-400">Live team stats unavailable right now.</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                                  <span>Team OPS</span>
                                  <span className="text-sky-500 tabular-nums">#{hubTeamStats.ranks.ops}</span>
                                </div>
                                <div className="text-xl font-black tabular-nums mt-0.5">
                                  {hubTeamStats.hitting.ops.toFixed(3).replace(/^0/, '')}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                  {hubTeamStats.hitting.runsPerGame.toFixed(2)} R/G • {hubTeamStats.hitting.homeRuns} HR
                                </div>
                              </div>

                              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                                  <span>Team ERA</span>
                                  <span className="text-emerald-500 tabular-nums">#{hubTeamStats.ranks.era}</span>
                                </div>
                                <div className="text-xl font-black tabular-nums mt-0.5">
                                  {hubTeamStats.pitching.era.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                  {hubTeamStats.pitching.whip.toFixed(2)} WHIP • {hubTeamStats.pitching.kPer9.toFixed(1)} K/9
                                </div>
                              </div>

                              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                                  <span>Run Diff</span>
                                  <span className="text-amber-500 tabular-nums">#{hubTeamStats.ranks.runDiff}</span>
                                </div>
                                <div
                                  className={`text-xl font-black tabular-nums mt-0.5 ${
                                    hubTeamStats.record.runDiff > 0
                                      ? 'text-emerald-500'
                                      : hubTeamStats.record.runDiff < 0
                                      ? 'text-rose-500'
                                      : ''
                                  }`}
                                >
                                  {hubTeamStats.record.runDiff > 0
                                    ? `+${hubTeamStats.record.runDiff}`
                                    : hubTeamStats.record.runDiff}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                  Pyth {hubTeamStats.record.pythWinPct.toFixed(3).replace(/^0/, '')} • {hubTeamStats.record.wins}-{hubTeamStats.record.losses}
                                </div>
                              </div>

                              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                                  <span>Defense FPCT</span>
                                  <span className="text-indigo-400 tabular-nums">#{hubTeamStats.ranks.fpct}</span>
                                </div>
                                <div className="text-xl font-black tabular-nums mt-0.5">
                                  {hubTeamStats.fielding.fieldingPct.toFixed(3).replace(/^0/, '')}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                  {hubTeamStats.fielding.errors} E • {hubTeamStats.fielding.doublePlays} DP
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                              {[
                                { label: 'OPS', rank: hubTeamStats.ranks.ops, val: hubTeamStats.hitting.ops.toFixed(3).replace(/^0/, '') },
                                { label: 'Runs', rank: hubTeamStats.ranks.runs, val: `${hubTeamStats.hitting.runs}` },
                                { label: 'ERA', rank: hubTeamStats.ranks.era, val: hubTeamStats.pitching.era.toFixed(2) },
                                { label: 'WHIP', rank: hubTeamStats.ranks.whip, val: hubTeamStats.pitching.whip.toFixed(2) },
                                { label: 'Fielding', rank: hubTeamStats.ranks.fpct, val: hubTeamStats.fielding.fieldingPct.toFixed(3).replace(/^0/, '') },
                              ].map((metric) => (
                                <div
                                  key={metric.label}
                                  className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="font-bold text-slate-400">{metric.label}</span>
                                    <span className="font-black tabular-nums text-slate-600 dark:text-slate-200">
                                      #{metric.rank} <span className="font-semibold text-slate-400">({metric.val})</span>
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className="h-full rounded-full animate-bar-grow"
                                      style={{
                                        width: `${rankBarWidth(metric.rank)}%`,
                                        backgroundColor: rankBarColor(metric.rank),
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Live Active Roster / Depth Chart & Injured List */}
                  <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-slate-900/90 dark:bg-slate-950 border border-slate-700/40 flex items-center justify-center p-1 shrink-0">
                          <TeamLogo abbr={info.abbr} size="sm" />
                        </span>
                        <div>
                          <h4 className="font-extrabold text-base">
                            {info.short} Live Roster &amp; Injured List
                          </h4>
                          <p className="text-xs text-slate-500">
                            Click any player for full career stats, splits &amp; Baseball Savant profile
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-44 sm:w-52">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={hubRosterSearch}
                            onChange={(e) => setHubRosterSearch(e.target.value)}
                            placeholder={`Filter ${info.short} roster...`}
                            className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                          {hubRosterSearch && (
                            <button
                              type="button"
                              onClick={() => setHubRosterSearch('')}
                              aria-label="Clear roster search"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <SlidingSegmented
                          variant="surface"
                          value={hubRosterView}
                          onChange={setHubRosterView}
                          options={[
                            { id: 'depth', label: 'Depth Chart' },
                            { id: 'il', label: `Injured List (${hubRoster?.ilCount ?? 0})` },
                            { id: 'all', label: `Full Roster (${hubRoster?.activeCount ?? 0})` },
                          ]}
                        />
                      </div>
                    </div>

                    {loadingHubRoster ? (
                      <BaseballLoader label={`Loading ${info.short} active roster & IL`} compact />
                    ) : !hubRoster ? (
                      <div className="text-center py-8 text-xs text-slate-400">Roster data unavailable right now.</div>
                    ) : hubRosterView === 'il' ? (
                      hubRoster.injuredList.filter(matchesRosterSearch).length === 0 ? (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 text-center">
                          {rosterQuery
                            ? `No Injured List players match "${hubRosterSearch}".`
                            : `No players currently listed on the ${info.short} Injured List.`}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {hubRoster.injuredList.filter(matchesRosterSearch).map((p) => (
                            <button
                              key={p.playerId}
                              type="button"
                              onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                              className="p-3 rounded-lg border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 flex items-center justify-between text-left transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PlayerAvatar playerId={p.playerId} playerName={p.fullName} teamAbbr={hubTeam} size="sm" />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold truncate">{p.fullName}</div>
                                  <div className="text-[11px] text-slate-500">{p.position} • Age {p.age}</div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-500 shrink-0">
                                {p.statusDescription}
                              </span>
                            </button>
                          ))}
                        </div>
                      )
                    ) : hubRosterView === 'depth' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                          { key: 'C', label: 'Catchers' },
                          { key: 'IF', label: 'Infielders' },
                          { key: 'OF', label: 'Outfielders' },
                          { key: 'P', label: 'Pitchers' },
                        ].map((grp) => {
                          const playersInGrp = (hubRoster.depthChart?.[grp.key] || []).filter(matchesRosterSearch);
                          return (
                            <div key={grp.key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-2">
                              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between pb-1 border-b border-slate-200/70 dark:border-slate-800/80">
                                <span>{grp.label}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[10px] font-black tabular-nums">
                                  {playersInGrp.length}
                                </span>
                              </div>
                              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                {playersInGrp.length === 0 ? (
                                  <div className="py-4 text-center text-[11px] text-slate-400">No matches</div>
                                ) : (
                                  playersInGrp.map((p) => (
                                    <button
                                      key={p.playerId}
                                      type="button"
                                      onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                                      className="w-full flex items-center justify-between gap-2 text-xs p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/80 text-left transition group"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <img
                                          src={`https://midfield.mlbstatic.com/v1/people/${p.playerId}/spots/60`}
                                          alt={p.fullName}
                                          loading="lazy"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                          }}
                                          className="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800 shrink-0"
                                          style={{ border: `1.5px solid ${info.color}` }}
                                        />
                                        <span className="font-bold truncate group-hover:text-sky-500 transition">
                                          {p.jerseyNumber ? <span className="text-slate-400 font-semibold mr-1 tabular-nums">#{p.jerseyNumber}</span> : null}
                                          {p.fullName}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                                        {p.position}
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {hubRoster.activePlayers.filter(matchesRosterSearch).map((p) => (
                          <button
                            key={p.playerId}
                            type="button"
                            onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 hover:border-sky-500/40 flex items-center gap-2.5 text-left transition group"
                          >
                            <PlayerAvatar playerId={p.playerId} playerName={p.fullName} teamAbbr={hubTeam} size="sm" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate group-hover:text-sky-500 transition">
                                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {p.position} • Age {p.age}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Additions & Departures Columns with Player Avatars */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-500">
                          Additions &amp; Club Activity
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-500 tabular-nums">
                          {additions.length}
                        </span>
                      </div>
                      {additions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged additions yet.</p>
                      ) : (
                        <ul className="space-y-2.5 text-sm">
                          {additions.map((a) => (
                            <li
                              key={a.id}
                              onClick={() => a.player_id && openPlayerModal(a.player_id, a.player_name, hubTeam)}
                              className={`p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 flex items-start gap-3 transition ${
                                a.player_id ? 'cursor-pointer hover:border-emerald-500/40' : ''
                              }`}
                            >
                              <PlayerAvatar playerId={a.player_id} playerName={a.player_name} teamAbbr={hubTeam} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs sm:text-sm leading-snug">{decodeHtml(a.headline)}</div>
                                <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                      a.status === 'REPORTED'
                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                        : 'bg-emerald-500/15 text-emerald-500'
                                    }`}
                                  >
                                    {a.status}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(a.reported_at).toLocaleDateString()}</span>
                                  {a.total_value_millions > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="font-extrabold text-sky-500">${a.total_value_millions}M</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-extrabold text-sm uppercase tracking-wider text-rose-500">
                          Departures &amp; Releases
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500/15 text-rose-500 tabular-nums">
                          {subtractions.length}
                        </span>
                      </div>
                      {subtractions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged departures yet.</p>
                      ) : (
                        <ul className="space-y-2.5 text-sm">
                          {subtractions.map((s) => (
                            <li
                              key={s.id}
                              onClick={() => s.player_id && openPlayerModal(s.player_id, s.player_name, hubTeam)}
                              className={`p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 flex items-start gap-3 transition ${
                                s.player_id ? 'cursor-pointer hover:border-rose-500/40' : ''
                              }`}
                            >
                              <PlayerAvatar playerId={s.player_id} playerName={s.player_name} teamAbbr={hubTeam} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs sm:text-sm leading-snug">{decodeHtml(s.headline)}</div>
                                <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold text-[10px]">
                                    {s.status}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(s.reported_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Live Team Stats & Power Rankings Hub (+ Live Offseason Activity) */}
        {activeTab === 'leaderboard' && (() => {
          const allStatsTeams = teamStatsData?.teams || [];
          const displaySeason = teamStatsData?.season || teamStatsSeason;
          const leagueAvg = teamStatsData?.leagueAvg || null;
          const leaders = teamStatsData?.leaders || {};

          const getSortValue = (t, key) => {
            switch (key) {
              case 'powerRank': return t.ranks?.power ?? 99;
              case 'winPct': return t.record?.winPct ?? 0;
              case 'wins': return t.record?.wins ?? 0;
              case 'runDiff': return t.record?.runDiff ?? 0;
              case 'pythWinPct': return t.record?.pythWinPct ?? 0;
              case 'runsPerGame': return t.hitting?.runsPerGame ?? 0;
              case 'runs': return t.hitting?.runs ?? 0;
              case 'hits': return t.hitting?.hits ?? 0;
              case 'homeRuns': return t.hitting?.homeRuns ?? 0;
              case 'stolenBases': return t.hitting?.stolenBases ?? 0;
              case 'avg': return t.hitting?.avg ?? 0;
              case 'obp': return t.hitting?.obp ?? 0;
              case 'slg': return t.hitting?.slg ?? 0;
              case 'ops': return t.hitting?.ops ?? 0;
              case 'era': return t.pitching?.era ?? 99;
              case 'whip': return t.pitching?.whip ?? 99;
              case 'kPer9': return t.pitching?.kPer9 ?? 0;
              case 'bbPer9': return t.pitching?.bbPer9 ?? 99;
              case 'pitchSo': return t.pitching?.strikeOuts ?? 0;
              case 'saves': return t.pitching?.saves ?? 0;
              case 'avgAgainst': return t.pitching?.avgAgainst ?? 1;
              case 'runsAllowedPerGame': return t.pitching?.runsAllowedPerGame ?? 99;
              case 'fieldingPct': return t.fielding?.fieldingPct ?? 0;
              case 'errors': return t.fielding?.errors ?? 999;
              case 'doublePlays': return t.fielding?.doublePlays ?? 0;
              case 'assists': return t.fielding?.assists ?? 0;
              case 'putOuts': return t.fielding?.putOuts ?? 0;
              default: return t.ranks?.power ?? 99;
            }
          };

          const filteredTeamStats = allStatsTeams
            .filter((t) => {
              if (teamStatsLeague !== 'ALL' && t.league !== teamStatsLeague) return false;
              if (teamStatsSearch.trim()) {
                const q = teamStatsSearch.trim().toLowerCase();
                const info = getTeamInfo(t.abbr);
                const hay = `${t.name} ${t.abbr} ${info.name} ${info.short} ${t.division}`.toLowerCase();
                if (!hay.includes(q)) return false;
              }
              return true;
            })
            .sort((a, b) => {
              const va = getSortValue(a, teamStatsSort.key);
              const vb = getSortValue(b, teamStatsSort.key);
              if (va !== vb) return teamStatsSort.dir === 'asc' ? va - vb : vb - va;
              return (a.ranks?.power ?? 99) - (b.ranks?.power ?? 99);
            });

          const fmt3 = (n) => Number(n || 0).toFixed(3).replace(/^0/, '');
          const fmt2 = (n) => Number(n || 0).toFixed(2);

          const renderSortHeader = (label, key, defaultDir = 'desc', align = 'right') => {
            const active = teamStatsSort.key === key;
            return (
              <th
                key={key}
                className={`py-2.5 px-2.5 text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap select-none cursor-pointer transition ${
                  align === 'left' ? 'text-left' : 'text-right'
                } ${active ? 'text-sky-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                onClick={() => toggleTeamStatsSort(key, defaultDir)}
              >
                <span className="inline-flex items-center gap-0.5">
                  <span>{label}</span>
                  {active && <span className="text-[10px]">{teamStatsSort.dir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
            );
          };

          const activeOffseasonRows =
            spendingApiData?.teams?.length > 0
              ? spendingApiData.teams.map((t) => ({
                  team: getTeamInfo(t.abbr),
                  totalMillions: t.totalMillions,
                  signingsCount: t.signingsCount,
                  tradesCount: t.tradesCount || 0,
                  totalMoves: t.totalMoves,
                }))
              : spendingLeaderboard;
          const displaySpent = spendingApiData ? spendingApiData.totalSpent : leagueStats.totalSpent;
          const displayMoves = spendingApiData ? spendingApiData.totalMoves : leagueStats.totalMlbMoves;
          const topClub = [...activeOffseasonRows].sort((a, b) => b.totalMoves - a.totalMoves)[0];
          const cycleMaxSpend = Math.max(1, ...activeOffseasonRows.map((r) => r.totalMillions));

          return (
            <div className="space-y-4">
              {/* Top Mode & Season Switcher */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">
                    {spendingMode === 'teamStats'
                      ? `${displaySeason} MLB Team Stats & Power Rankings`
                      : `Offseason Deals & Activity (${spendingCycle})`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {spendingMode === 'teamStats'
                      ? `Official MLB Stats API 30-team offense, pitching, defense & run differential • Click any column to sort or any club for Team Hub`
                      : (spendingApiData?.dataSource || 'Sorted by disclosed contract dollars, then total roster moves')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SlidingSegmented
                    variant="surface"
                    value={spendingMode}
                    onChange={setSpendingMode}
                    options={[
                      { id: 'teamStats', label: 'Team Stats' },
                      { id: 'offseason', label: 'Offseason Moves' },
                    ]}
                  />

                  {spendingMode === 'teamStats' ? (
                    <YearPicker
                      value={teamStatsSeason}
                      years={ALL_SEASON_YEARS}
                      onChange={setTeamStatsSeason}
                    />
                  ) : (
                    <SlidingSegmented
                      variant="surface"
                      value={spendingCycle}
                      onChange={setSpendingCycle}
                      options={OFFSEASON_CYCLES.map((cyc) => ({ id: cyc, label: cyc }))}
                    />
                  )}
                </div>
              </div>

              {spendingMode === 'teamStats' ? (
                <>
                  {/* Category, League & Team Search Controls */}
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                    <SlidingSegmented
                      variant="underline"
                      value={teamStatsGroup}
                      onChange={switchTeamStatsGroup}
                      options={[
                        { id: 'overview', label: 'Power & Overview' },
                        { id: 'hitting', label: 'Offense' },
                        { id: 'pitching', label: 'Pitching' },
                        { id: 'fielding', label: 'Defense' },
                      ]}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <SlidingSegmented
                        variant="surface"
                        value={teamStatsLeague}
                        onChange={setTeamStatsLeague}
                        buttonClassName="!px-2.5 !text-[11px]"
                        options={[
                          { id: 'ALL', label: 'All MLB' },
                          { id: 'AL', label: 'AL' },
                          { id: 'NL', label: 'NL' },
                        ]}
                      />
                      <div className="relative min-w-[170px]">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={teamStatsSearch}
                          onChange={(e) => setTeamStatsSearch(e.target.value)}
                          placeholder="Filter team..."
                          className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        {teamStatsSearch && (
                          <button
                            type="button"
                            onClick={() => setTeamStatsSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic League Summary Tiles */}
                  {leagueAvg && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      {teamStatsGroup === 'overview' && (
                        <>
                          <button
                            type="button"
                            onClick={() => leaders.bestRunDiff && openTeamHub(leaders.bestRunDiff.abbr)}
                            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500/40 transition flex items-center gap-3 text-left"
                          >
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                              {leaders.bestRunDiff ? <TeamLogo abbr={leaders.bestRunDiff.abbr} size="sm" /> : <Trophy className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-lg font-black tabular-nums truncate">
                                {leaders.bestRunDiff ? `${getTeamInfo(leaders.bestRunDiff.abbr).short} (${leaders.bestRunDiff.runDiff > 0 ? `+${leaders.bestRunDiff.runDiff}` : leaders.bestRunDiff.runDiff})` : '—'}
                              </div>
                              <div className="text-xs text-slate-500">Best Run Differential ({displaySeason})</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => leaders.topOffense && openTeamHub(leaders.topOffense.abbr)}
                            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500/40 transition flex items-center gap-3 text-left"
                          >
                            <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0">
                              {leaders.topOffense ? <TeamLogo abbr={leaders.topOffense.abbr} size="sm" /> : <Zap className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-lg font-black tabular-nums truncate">
                                {leaders.topOffense ? `${getTeamInfo(leaders.topOffense.abbr).short} (${fmt3(leaders.topOffense.ops)} OPS)` : '—'}
                              </div>
                              <div className="text-xs text-slate-500">Top MLB Offense • Avg {fmt3(leagueAvg.ops)}</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => leaders.topPitching && openTeamHub(leaders.topPitching.abbr)}
                            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500/40 transition flex items-center gap-3 text-left"
                          >
                            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                              {leaders.topPitching ? <TeamLogo abbr={leaders.topPitching.abbr} size="sm" /> : <Shield className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-lg font-black tabular-nums truncate">
                                {leaders.topPitching ? `${getTeamInfo(leaders.topPitching.abbr).short} (${fmt2(leaders.topPitching.era)} ERA)` : '—'}
                              </div>
                              <div className="text-xs text-slate-500">Top Pitching Staff • Avg {fmt2(leagueAvg.era)}</div>
                            </div>
                          </button>
                        </>
                      )}

                      {teamStatsGroup === 'hitting' && (
                        <>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center">
                              <BarChart3 className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt3(leagueAvg.ops)}</div>
                              <div className="text-xs text-slate-500">MLB Average OPS ({displaySeason})</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt2(leagueAvg.runsPerGame)} R/G</div>
                              <div className="text-xs text-slate-500">League Avg Runs/Game • {fmt3(leagueAvg.avg)} AVG</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                              <Flame className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{leagueAvg.totalHomeRuns.toLocaleString()} HR</div>
                              <div className="text-xs text-slate-500">Total MLB Home Runs ({leagueAvg.homeRuns}/team)</div>
                            </div>
                          </div>
                        </>
                      )}

                      {teamStatsGroup === 'pitching' && (
                        <>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                              <Shield className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt2(leagueAvg.era)}</div>
                              <div className="text-xs text-slate-500">MLB Average ERA ({displaySeason})</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt2(leagueAvg.whip)}</div>
                              <div className="text-xs text-slate-500">MLB Average WHIP</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                              <Zap className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt2(leagueAvg.kPer9)} K/9</div>
                              <div className="text-xs text-slate-500">League Avg Strikeouts per 9</div>
                            </div>
                          </div>
                        </>
                      )}

                      {teamStatsGroup === 'fielding' && (
                        <>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                              <Shield className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{fmt3(leagueAvg.fieldingPct)}</div>
                              <div className="text-xs text-slate-500">MLB Average Fielding % ({displaySeason})</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center">
                              <Award className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">
                                {leaders.topDefense ? `${getTeamInfo(leaders.topDefense.abbr).short} (${fmt3(leaders.topDefense.fieldingPct)})` : '—'}
                              </div>
                              <div className="text-xs text-slate-500">Top Defensive Club</div>
                            </div>
                          </div>
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xl font-black tabular-nums">{leagueAvg.errors} E</div>
                              <div className="text-xs text-slate-500">Average Errors per Club</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Sortable 30-Team Stats Table */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                    {loadingTeamStats ? (
                      <BaseballLoader label={`Loading ${teamStatsSeason} official MLB team stats`} compact />
                    ) : filteredTeamStats.length === 0 ? (
                      <div className="p-10 text-center text-sm text-slate-400">
                        No MLB team stats matched your filters for {displaySeason}.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2.5 pl-4 pr-2 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-400 w-10">
                                #
                              </th>
                              <th className="py-2.5 px-2 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                                Team
                              </th>
                              {teamStatsGroup === 'overview' && (
                                <>
                                  {renderSortHeader('W-L', 'winPct', 'desc')}
                                  {renderSortHeader('PCT', 'winPct', 'desc')}
                                  {renderSortHeader('Pyth', 'pythWinPct', 'desc')}
                                  {renderSortHeader('Diff', 'runDiff', 'desc')}
                                  {renderSortHeader('R/G', 'runsPerGame', 'desc')}
                                  {renderSortHeader('OPS', 'ops', 'desc')}
                                  {renderSortHeader('ERA', 'era', 'asc')}
                                  {renderSortHeader('WHIP', 'whip', 'asc')}
                                  {renderSortHeader('FPCT', 'fieldingPct', 'desc')}
                                </>
                              )}
                              {teamStatsGroup === 'hitting' && (
                                <>
                                  {renderSortHeader('R', 'runs', 'desc')}
                                  {renderSortHeader('R/G', 'runsPerGame', 'desc')}
                                  {renderSortHeader('H', 'hits', 'desc')}
                                  {renderSortHeader('HR', 'homeRuns', 'desc')}
                                  {renderSortHeader('SB', 'stolenBases', 'desc')}
                                  {renderSortHeader('AVG', 'avg', 'desc')}
                                  {renderSortHeader('OBP', 'obp', 'desc')}
                                  {renderSortHeader('SLG', 'slg', 'desc')}
                                  {renderSortHeader('OPS', 'ops', 'desc')}
                                </>
                              )}
                              {teamStatsGroup === 'pitching' && (
                                <>
                                  {renderSortHeader('ERA', 'era', 'asc')}
                                  {renderSortHeader('WHIP', 'whip', 'asc')}
                                  {renderSortHeader('RA/G', 'runsAllowedPerGame', 'asc')}
                                  {renderSortHeader('SO', 'pitchSo', 'desc')}
                                  {renderSortHeader('K/9', 'kPer9', 'desc')}
                                  {renderSortHeader('BB/9', 'bbPer9', 'asc')}
                                  {renderSortHeader('BAA', 'avgAgainst', 'asc')}
                                  {renderSortHeader('SV', 'saves', 'desc')}
                                </>
                              )}
                              {teamStatsGroup === 'fielding' && (
                                <>
                                  {renderSortHeader('FPCT', 'fieldingPct', 'desc')}
                                  {renderSortHeader('E', 'errors', 'asc')}
                                  {renderSortHeader('DP', 'doublePlays', 'desc')}
                                  {renderSortHeader('A', 'assists', 'desc')}
                                  {renderSortHeader('PO', 'putOuts', 'desc')}
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {filteredTeamStats.map((t, idx) => {
                              const info = getTeamInfo(t.abbr);
                              return (
                                <tr
                                  key={t.teamId}
                                  onClick={() => openTeamHub(t.abbr)}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                                >
                                  <td className="py-3 pl-4 pr-2 font-black text-xs text-slate-400 tabular-nums">
                                    {idx + 1}
                                  </td>
                                  <td className="py-3 px-2 whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-7 h-7 rounded-md bg-slate-900/90 dark:bg-slate-950 border border-slate-700/40 flex items-center justify-center p-0.5 shrink-0">
                                        <TeamLogo abbr={t.abbr} size="xs" />
                                      </span>
                                      <div className="min-w-0">
                                        <div className="font-bold text-xs sm:text-sm leading-tight">
                                          {info.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                          {t.division || t.league}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {teamStatsGroup === 'overview' && (
                                    <>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums whitespace-nowrap">
                                        {t.record.wins}-{t.record.losses}
                                      </td>
                                      <td className="py-3 px-2.5 text-right font-semibold tabular-nums text-slate-500 dark:text-slate-300">
                                        {fmt3(t.record.winPct)}
                                      </td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500">
                                        {fmt3(t.record.pythWinPct)}
                                      </td>
                                      <td
                                        className={`py-3 px-2.5 text-right font-extrabold tabular-nums ${
                                          t.record.runDiff > 0
                                            ? 'text-emerald-500'
                                            : t.record.runDiff < 0
                                            ? 'text-rose-500'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {t.record.runDiff > 0 ? `+${t.record.runDiff}` : t.record.runDiff}
                                      </td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">
                                        {fmt2(t.hitting.runsPerGame)}
                                      </td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-sky-600 dark:text-sky-400">
                                        {fmt3(t.hitting.ops)}
                                      </td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                        {fmt2(t.pitching.era)}
                                      </td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">
                                        {fmt2(t.pitching.whip)}
                                      </td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500">
                                        {fmt3(t.fielding.fieldingPct)}
                                      </td>
                                    </>
                                  )}

                                  {teamStatsGroup === 'hitting' && (
                                    <>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums">{t.hitting.runs}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">{fmt2(t.hitting.runsPerGame)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{t.hitting.hits}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-amber-500">{t.hitting.homeRuns}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">{t.hitting.stolenBases}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{fmt3(t.hitting.avg)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{fmt3(t.hitting.obp)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{fmt3(t.hitting.slg)}</td>
                                      <td className="py-3 px-2.5 text-right font-extrabold tabular-nums text-sky-600 dark:text-sky-400">{fmt3(t.hitting.ops)}</td>
                                    </>
                                  )}

                                  {teamStatsGroup === 'pitching' && (
                                    <>
                                      <td className="py-3 px-2.5 text-right font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt2(t.pitching.era)}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-sky-600 dark:text-sky-400">{fmt2(t.pitching.whip)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">{fmt2(t.pitching.runsAllowedPerGame)}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums">{t.pitching.strikeOuts}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{fmt2(t.pitching.kPer9)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">{fmt2(t.pitching.bbPer9)}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{fmt3(t.pitching.avgAgainst)}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-amber-500">{t.pitching.saves}</td>
                                    </>
                                  )}

                                  {teamStatsGroup === 'fielding' && (
                                    <>
                                      <td className="py-3 px-2.5 text-right font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt3(t.fielding.fieldingPct)}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-rose-500">{t.fielding.errors}</td>
                                      <td className="py-3 px-2.5 text-right font-bold tabular-nums text-sky-600 dark:text-sky-400">{t.fielding.doublePlays}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums">{t.fielding.assists}</td>
                                      <td className="py-3 px-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300">{t.fielding.putOuts}</td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-black">${Number(displaySpent || 0).toFixed(1)}M</div>
                        <div className="text-xs text-slate-500">Disclosed New Deals ({spendingCycle})</div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-500 flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-black">{displayMoves}</div>
                        <div className="text-xs text-slate-500">MLB Moves in {spendingCycle}</div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-black">{topClub?.team?.short || '—'}</div>
                        <div className="text-xs text-slate-500">
                          Most Active ({topClub?.totalMoves || 0} moves)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                    {loadingSpending ? (
                      <BaseballLoader label={`Crunching ${spendingCycle} MLB offseason moves`} compact />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-slate-100 dark:bg-slate-800">
                        {activeOffseasonRows.map((row, idx) => {
                          const pct = row.totalMillions > 0 ? Math.max(6, (row.totalMillions / cycleMaxSpend) * 100) : 0;
                          return (
                            <div
                              key={row.team.abbr}
                              onClick={() => openTeamHub(row.team.abbr)}
                              className="px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="w-6 text-xs font-black text-slate-400">#{idx + 1}</span>
                                  <span
                                    className="w-10 text-center py-0.5 rounded text-xs font-black shadow-sm"
                                    style={getTeamBadgeStyle(row.team.color)}
                                  >
                                    {row.team.abbr}
                                  </span>
                                  <span className="font-bold text-sm">{row.team.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-extrabold text-sm">
                                    ${row.totalMillions.toFixed(1)}M
                                  </span>
                                  <span className="ml-2 text-xs text-slate-400">
                                    ({row.totalMoves} {row.totalMoves === 1 ? 'move' : 'moves'})
                                  </span>
                                </div>
                              </div>
                              {pct > 0 && (
                                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, backgroundColor: row.team.color }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}
        </div>
        )}
      </main>

      <footer className="max-w-[1440px] mx-auto px-4 sm:px-6 mt-12 pb-20 lg:pb-6">
        <div className="pt-5 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="space-y-1">
            <p className="font-semibold text-slate-600 dark:text-slate-300">
              Hot Stove Tracker — Free, Unofficial Non-Commercial MLB Fan Dashboard
            </p>
            <p className="leading-relaxed max-w-3xl">
              Not affiliated with, endorsed by, or sponsored by Major League Baseball, MLB Advanced Media, L.P., or the MLBPA. Official roster, standings, and statistical data provided via MLB Stats API &amp; Baseball Savant. All video links open directly on MLB.com.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1 shrink-0">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Made by Brandon Au
            </p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              For Personal &amp; Fan Use Only
            </span>
          </div>
        </div>
      </footer>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur grid grid-cols-6 py-2">
        {!selectedPlayer && !compareOpen && !profileOpen && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 h-0.5 w-1/6 bg-sky-500 rounded-full hst-sliding-pill"
            style={{ transform: `translateX(${Math.max(0, MAIN_TAB_ORDER.indexOf(activeTab)) * 100}%)` }}
          />
        )}
        {[
          { id: 'feed', label: 'Feed', icon: Flame },
          { id: 'freeAgents', label: 'Agents', icon: Users },
          { id: 'scoresStandings', label: 'Scores', icon: Calendar },
          { id: 'leaders', label: 'Leaders', icon: Award },
          { id: 'teamHub', label: 'Teams', icon: ArrowLeftRight },
          { id: 'leaderboard', label: 'Stats', icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          const active = !selectedPlayer && !compareOpen && !profileOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => switchMainTab(item.id)}
              className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors ${
                active ? 'text-sky-500' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global MLB Player Search Modal */}
      {playerSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 p-4"
          onClick={() => setPlayerSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
              <Search className="w-5 h-5 text-sky-500 shrink-0" />
              <input
                type="text"
                autoFocus
                value={globalPlayerQuery}
                onChange={(e) => setGlobalPlayerQuery(e.target.value)}
                placeholder="Search any MLB player (e.g., Shohei Ohtani, Aaron Judge)..."
                className="w-full bg-transparent text-sm font-semibold focus:outline-none"
              />
              <button
                onClick={() => setPlayerSearchOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {globalPlayerQuery.trim().length < 2 ? (
                recentPlayers.length > 0 ? (
                  <div className="p-2 space-y-2">
                    <div className="px-2 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-sky-500" /> Recent Players
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecentPlayers([]);
                          try { localStorage.removeItem('hst_recent_players'); } catch {}
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-400"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-1">
                      {recentPlayers.map((rp) => {
                        const activeAbbr = resolveActiveTeamAbbr(rp.teamAbbr);
                        const rpTeam = activeAbbr ? getTeamInfo(activeAbbr) : null;
                        const isPinned = pinnedPlayerIdSet.has(Number(rp.id));
                        const canPinRecent = isEligibleToPinPlayer({
                          playerId: rp.id,
                          fullName: rp.fullName,
                          isProspect: rp.isProspect,
                        });
                        return (
                          <div
                            key={rp.id}
                            onClick={() => {
                              setPlayerSearchOpen(false);
                              openPlayerModal(rp.id, rp.fullName, activeAbbr);
                            }}
                            className="w-full p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 text-left cursor-pointer transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar playerId={rp.id} playerName={rp.fullName} teamAbbr={activeAbbr} size="sm" />
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-bold truncate">{rp.fullName}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <span>{rp.position || 'MLB'}</span>
                                  {rpTeam && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-black shadow-sm"
                                      style={getTeamBadgeStyle(rpTeam.color)}
                                    >
                                      {rpTeam.abbr}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {canPinRecent && (
                              <button
                                type="button"
                                onClick={(e) =>
                                  togglePinnedPlayer(
                                    {
                                      playerId: rp.id,
                                      fullName: rp.fullName,
                                      position: rp.position,
                                      teamAbbr: activeAbbr,
                                      active: rp.active,
                                      mlbDebutDate: rp.mlbDebutDate,
                                      isProspect: rp.isProspect,
                                    },
                                    e
                                  )
                                }
                                title={isPinned ? `Unpin ${rp.fullName}` : `Pin ${rp.fullName} to Profile`}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 transition ${
                                  isPinned
                                    ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-red-500/50 hover:text-red-500'
                                }`}
                              >
                                <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
                                <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Type at least 2 letters to search and pin active, retired, or historical MLB players (prospects excluded — press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">/</kbd> anytime).
                  </div>
                )
              ) : searchingPlayers ? (
                <BaseballLoader label="Searching MLB players" compact />
              ) : globalPlayerResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No MLB players found matching &ldquo;{globalPlayerQuery}&rdquo;.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalPlayerResults.map((p) => {
                    const activeAbbr = resolveActiveTeamAbbr(p.teamAbbr);
                    const tInfo = activeAbbr ? getTeamInfo(activeAbbr) : null;
                    const isPinned = pinnedPlayerIdSet.has(Number(p.id));
                    const canPin = isEligibleToPinPlayer({
                      playerId: p.id,
                      fullName: p.fullName,
                      mlbDebutDate: p.mlbDebutDate,
                      isProspect: p.isProspect,
                      requireDebutCheck: true,
                    });
                    const metaBits = [
                      p.age ? `Age ${p.age}` : null,
                      p.mlbDebutDate ? `Debut ${p.mlbDebutDate.slice(0, 4)}` : null,
                    ].filter(Boolean);

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setPlayerSearchOpen(false);
                          openPlayerModal(p.id, p.fullName, activeAbbr);
                        }}
                        className="w-full p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-3 text-left cursor-pointer transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar
                            playerId={p.id}
                            playerName={p.fullName}
                            teamAbbr={activeAbbr}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                              <span className="truncate">{p.fullName}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold shrink-0">
                                {p.position || 'MLB'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                              {tInfo && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-black shadow-sm"
                                  style={getTeamBadgeStyle(tInfo.color)}
                                >
                                  {tInfo.abbr}
                                </span>
                              )}
                              {metaBits.length > 0 && (
                                <span>{metaBits.join(' • ')}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.active
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {p.active ? 'Active' : 'Retired'}
                          </span>
                          {canPin && (
                            <button
                              type="button"
                              onClick={(e) =>
                                togglePinnedPlayer(
                                  {
                                    playerId: p.id,
                                    fullName: p.fullName,
                                    position: p.position,
                                    teamAbbr: activeAbbr,
                                    active: p.active,
                                    mlbDebutDate: p.mlbDebutDate,
                                    isProspect: p.isProspect,
                                    requireDebutCheck: true,
                                  },
                                  e
                                )
                              }
                              title={isPinned ? `Unpin ${p.fullName}` : `Pin ${p.fullName} to Profile`}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                                isPinned
                                  ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-red-500/50 hover:text-red-500'
                              }`}
                            >
                              <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
                              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clickable Live MLB Box Score, Scoring Plays & Embedded Highlights Modal */}
      {selectedGamePk && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          onClick={() => setSelectedGamePk(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black truncate">
                    {boxScore ? `${boxScore.away.abbr} @ ${boxScore.home.abbr} — Box Score` : 'Loading MLB Box Score...'}
                  </h3>
                  {boxScore?.abstractState === 'Live' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-500 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                </div>
                {boxScore && (
                  <p className="text-xs text-slate-500 truncate">
                    {boxScore.status}{boxScore.venue ? ` • ${boxScore.venue}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openBoxScore(selectedGamePk, { silent: true })}
                  disabled={refreshingBoxScore || loadingBoxScore}
                  title="Refresh Box Score & Highlights"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500 disabled:opacity-50 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${refreshingBoxScore ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  onClick={copyShareUrl}
                  title="Copy direct link to this game"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 text-sky-500" />}
                  <span className="hidden sm:inline">{copiedLink ? 'Copied!' : 'Share'}</span>
                </button>
                <button
                  onClick={() => setSelectedGamePk(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {loadingBoxScore ? (
                <BaseballLoader label="Loading box score, scoring plays & official highlights" />
              ) : !boxScore ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Box score data is not available for this game yet.
                </div>
              ) : (() => {
                const awayInfo = getTeamInfo(boxScore.away.abbr);
                const homeInfo = getTeamInfo(boxScore.home.abbr);
                const ls = boxScore.linescore;
                const activeSide = boxScoreTeamTab === 'home' ? boxScore.home : boxScore.away;
                const activeSideInfo = boxScoreTeamTab === 'home' ? homeInfo : awayInfo;
                const inningCount = Math.max(9, ls.innings?.length || 0);
                const inningNums = Array.from({ length: inningCount }, (_, i) => i + 1);
                const highlightsList = boxScore.highlights || [];
                const scoringList = boxScore.scoringPlays || [];
                const featuredRecap = highlightsList.find((h) => h.isRecap) || highlightsList[0] || null;

                return (
                  <>
                    {/* Scoreboard Banner + Live Count/Bases */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="md:col-span-8 space-y-2">
                        {[
                          { info: awayInfo, runs: ls.away.runs, hits: ls.away.hits, err: ls.away.errors },
                          { info: homeInfo, runs: ls.home.runs, hits: ls.home.hits, err: ls.home.errors },
                        ].map((row, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <button
                              onClick={() => openTeamHub(row.info.abbr)}
                              className="flex items-center gap-2.5 hover:opacity-85"
                            >
                              <span className="w-9 h-9 rounded-lg bg-slate-900/90 dark:bg-slate-900 border border-slate-700/50 flex items-center justify-center p-1.5 shrink-0 shadow-sm">
                                <TeamLogo abbr={row.info.abbr} size="sm" />
                              </span>
                              <span className="font-extrabold text-sm sm:text-base">{row.info.name}</span>
                            </button>
                            <div className="flex items-center gap-4">
                              <span className="text-2xl font-black">{row.runs ?? '—'}</span>
                              <span className="text-xs text-slate-400 w-16 text-right">
                                {row.hits ?? '—'} H • {row.err ?? '—'} E
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="md:col-span-4 md:border-l border-slate-200 dark:border-slate-800 md:pl-4 flex items-center justify-between md:justify-center gap-4">
                        {boxScore.abstractState === 'Live' ? (
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12">
                              <div className={`w-3.5 h-3.5 rotate-45 absolute top-0 left-1/2 -translate-x-1/2 border ${ls.onSecond ? 'bg-amber-400 border-amber-400' : 'border-slate-400'}`} />
                              <div className={`w-3.5 h-3.5 rotate-45 absolute top-1/2 right-0 -translate-y-1/2 border ${ls.onFirst ? 'bg-amber-400 border-amber-400' : 'border-slate-400'}`} />
                              <div className={`w-3.5 h-3.5 rotate-45 absolute top-1/2 left-0 -translate-y-1/2 border ${ls.onThird ? 'bg-amber-400 border-amber-400' : 'border-slate-400'}`} />
                            </div>
                            <div className="text-xs font-bold space-y-0.5">
                              <div className="text-rose-500 font-black">{ls.inningHalf} {ls.currentInning}</div>
                              <div>{ls.balls ?? 0}-{ls.strikes ?? 0} Count</div>
                              <div>{ls.outs ?? 0} Out{ls.outs === 1 ? '' : 's'}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs space-y-1">
                            <div className="font-black text-sky-500 uppercase">{boxScore.status}</div>
                            {boxScore.decisions?.winner && <div>W: <strong>{boxScore.decisions.winner}</strong></div>}
                            {boxScore.decisions?.loser && <div>L: {boxScore.decisions.loser}</div>}
                            {boxScore.decisions?.save && <div>SV: {boxScore.decisions.save}</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Watch Highlights Callout Banner — Direct Outbound Link to MLB.com */}
                    {featuredRecap && (
                      <a
                        href={featuredRecap.mlbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative overflow-hidden w-full p-3 sm:p-3.5 rounded-lg border border-rose-500/30 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-sky-500/10 hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/10 flex items-center justify-between gap-3.5 text-left transition-all"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {featuredRecap.thumbnail ? (
                            <div className="relative w-20 sm:w-24 aspect-video rounded-lg overflow-hidden bg-slate-900 border border-white/15 shrink-0 shadow-md">
                              <img
                                src={featuredRecap.thumbnail}
                                alt={featuredRecap.headline}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 flex items-center justify-center transition">
                                <span className="w-7 h-7 rounded-full bg-rose-600/95 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                                {featuredRecap.isRecap ? 'Official Game Recap' : 'Featured Highlight'}
                              </span>
                              {featuredRecap.duration && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                  {featuredRecap.duration}
                                </span>
                              )}
                            </div>
                            <div className="text-xs sm:text-sm font-extrabold truncate group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors mt-0.5">
                              {featuredRecap.headline}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                              Opens official video on MLB.com{highlightsList.length > 1 ? ` • ${highlightsList.length} clips in Highlights tab` : ''}
                            </div>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-extrabold bg-rose-600 group-hover:bg-rose-500 text-white shadow-sm shrink-0 transition">
                          <span>Watch</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      </a>
                    )}

                    {/* Inning-by-Inning Linescore */}
                    {ls.innings?.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-xs text-center border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400">
                              <th className="py-2 pl-3 pr-2 text-left font-bold">Team</th>
                              {inningNums.map((n) => (
                                <th key={n} className="py-2 px-1.5 font-bold">{n}</th>
                              ))}
                              <th className="py-2 px-2 font-black text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800">R</th>
                              <th className="py-2 px-2 font-bold">H</th>
                              <th className="py-2 px-2 font-bold">E</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {[
                              { abbr: awayInfo.abbr, key: 'awayRuns', totals: ls.away },
                              { abbr: homeInfo.abbr, key: 'homeRuns', totals: ls.home },
                            ].map((r) => (
                              <tr key={r.abbr}>
                                <td className="py-2 pl-3 pr-2 text-left font-black">{r.abbr}</td>
                                {inningNums.map((n) => {
                                  const inn = ls.innings.find((x) => x.num === n);
                                  const val = inn ? inn[r.key] : null;
                                  return (
                                    <td key={n} className="py-2 px-1.5 font-semibold text-slate-600 dark:text-slate-300">
                                      {val !== null && val !== undefined ? val : '·'}
                                    </td>
                                  );
                                })}
                                <td className="py-2 px-2 font-black text-sky-500 border-l border-slate-200 dark:border-slate-800">{r.totals.runs ?? '—'}</td>
                                <td className="py-2 px-2 font-bold">{r.totals.hits ?? '—'}</td>
                                <td className="py-2 px-2">{r.totals.errors ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Modal Sub-Tabs: Away | Home | Scoring Plays | Highlights */}
                    <SlidingSegmented
                      variant="surface"
                      value={boxScoreTeamTab}
                      onChange={setBoxScoreTeamTab}
                      buttonClassName="!px-3.5 !py-1.5"
                      options={[
                        { id: 'away', label: `${awayInfo.short} Box Score` },
                        { id: 'home', label: `${homeInfo.short} Box Score` },
                        { id: 'scoring', label: `Scoring Plays (${scoringList.length})` },
                        { id: 'highlights', label: `Highlights (${highlightsList.length})` },
                      ]}
                    />

                    {/* TAB: OFFICIAL MLB VIDEO HIGHLIGHTS (Direct Outbound Links) */}
                    {boxScoreTeamTab === 'highlights' ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Click any card below to watch the official HD clip directly on MLB.com.
                          </p>
                          {boxScore.gameVideoHubUrl && (
                            <a
                              href={boxScore.gameVideoHubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500 text-sky-600 dark:text-sky-400 transition"
                            >
                              <span>All Game Videos on MLB.com</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {highlightsList.length === 0 ? (
                          <div className="p-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
                            <p className="text-xs text-slate-400">
                              No official MLB highlight clips are published for this game yet (clips appear as big plays happen and full recaps post shortly after the final out).
                            </p>
                            {boxScore.gameVideoHubUrl && (
                              <a
                                href={boxScore.gameVideoHubUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
                              >
                                <span>Check MLB.com Gameday Video</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Featured Recap / Top Highlight Hero Card */}
                            {(() => {
                              const leadClip = highlightsList[0];
                              return (
                                <a
                                  href={leadClip.mlbUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-rose-500/60 bg-slate-950 shadow-md hover:shadow-xl transition-all"
                                >
                                  <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full bg-slate-900 overflow-hidden">
                                    {leadClip.thumbnail ? (
                                      <img
                                        src={leadClip.thumbnail}
                                        alt={leadClip.headline}
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950" />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-black/15" />

                                    {/* Center Frosted Play Medallion */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="w-16 h-16 rounded-full bg-rose-600/95 group-hover:bg-rose-500 text-white flex items-center justify-center shadow-2xl shadow-rose-600/40 ring-4 ring-white/25 group-hover:scale-110 transition-all duration-300">
                                        <Play className="w-7 h-7 fill-current ml-1" />
                                      </span>
                                    </div>

                                    {/* Top Badges */}
                                    <div className="absolute top-3 left-3 flex items-center gap-2">
                                      {leadClip.isRecap && (
                                        <span className="px-2.5 py-1 rounded-full bg-rose-600 text-[10px] font-black uppercase tracking-wider text-white shadow">
                                          Official Recap
                                        </span>
                                      )}
                                      {leadClip.duration && (
                                        <span className="px-2 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-[11px] font-bold text-white tabular-nums">
                                          {leadClip.duration}
                                        </span>
                                      )}
                                    </div>

                                    <div className="absolute top-3 right-3">
                                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 text-[11px] font-extrabold text-white group-hover:bg-sky-600 group-hover:border-sky-500 transition">
                                        <span>Watch on MLB.com</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </span>
                                    </div>

                                    {/* Bottom Headline & Blurb */}
                                    <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 text-white">
                                      <h4 className="font-black text-base sm:text-xl leading-snug drop-shadow-sm">
                                        {leadClip.headline}
                                      </h4>
                                      {leadClip.blurb && (
                                        <p className="text-xs sm:text-sm text-slate-200/90 mt-1 line-clamp-2 max-w-3xl">
                                          {leadClip.blurb}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </a>
                              );
                            })()}

                            {/* Highlight Clips Grid */}
                            {highlightsList.length > 1 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                {highlightsList.slice(1).map((clip) => (
                                  <a
                                    key={clip.id}
                                    href={clip.mlbUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500/60 hover:shadow-lg transition-all flex flex-col"
                                  >
                                    <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
                                      {clip.thumbnail ? (
                                        <img
                                          src={clip.thumbnail}
                                          alt={clip.headline}
                                          loading="lazy"
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                                          <Play className="w-8 h-8" />
                                        </div>
                                      )}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent group-hover:via-black/30 transition" />
                                      <div className="absolute inset-0 flex items-center justify-center opacity-85 group-hover:opacity-100 transition">
                                        <span className="w-10 h-10 rounded-full bg-black/65 group-hover:bg-rose-600 text-white border border-white/25 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                                          <Play className="w-4 h-4 fill-current ml-0.5" />
                                        </span>
                                      </div>
                                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white tabular-nums">
                                        {clip.duration || 'VIDEO'}
                                      </div>
                                      {clip.isRecap && (
                                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-600 text-[9px] font-black text-white">
                                          RECAP
                                        </div>
                                      )}
                                    </div>
                                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                                      <div className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-sky-500 transition-colors">
                                        {clip.headline}
                                      </div>
                                      <div className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-400 group-hover:text-sky-500 transition-colors">
                                        <span>Watch on MLB.com</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : boxScoreTeamTab === 'scoring' ? (
                      /* TAB: SCORING PLAYS LOG */
                      <div className="space-y-2.5">
                        {scoringList.length === 0 ? (
                          <div className="p-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                            No scoring plays recorded yet.
                          </div>
                        ) : (
                          scoringList.map((sp, i) => (
                            <div
                              key={`${sp.atBatIndex}-${i}`}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400">
                                    {sp.half} {sp.inning}
                                  </span>
                                  <span className="text-xs font-extrabold">{sp.event}</span>
                                  {sp.batterId && sp.batterName && (
                                    <button
                                      type="button"
                                      onClick={() => openPlayerModal(sp.batterId, sp.batterName, 'MLB')}
                                      className="text-[11px] font-bold text-sky-500 hover:underline"
                                    >
                                      {sp.batterName}
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                  {sp.description}
                                </p>
                              </div>
                              <div className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-black shrink-0 text-center">
                                {awayInfo.abbr} {sp.awayScore ?? 0} – {homeInfo.abbr} {sp.homeScore ?? 0}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      /* TAB: AWAY / HOME BATTING & PITCHING BOX SCORE */
                      <>
                        <div className="space-y-2">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                            {activeSideInfo.name} Batting (Click any player for full profile)
                          </h4>
                          {activeSide.batters.length === 0 ? (
                            <p className="text-xs text-slate-400">Lineup / batting stats not posted yet.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                              <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                                    <th className="py-2 pl-3 pr-2 font-bold">Batter</th>
                                    <th className="py-2 px-2 font-bold text-right">AB</th>
                                    <th className="py-2 px-2 font-bold text-right">R</th>
                                    <th className="py-2 px-2 font-bold text-right">H</th>
                                    <th className="py-2 px-2 font-bold text-right">RBI</th>
                                    <th className="py-2 px-2 font-bold text-right">BB</th>
                                    <th className="py-2 px-2 font-bold text-right">SO</th>
                                    <th className="py-2 px-2 font-bold text-right">AVG</th>
                                    <th className="py-2 pr-3 pl-2 font-bold text-right">OPS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {activeSide.batters.map((b, i) => (
                                    <tr
                                      key={`${b.playerId}-${i}`}
                                      onClick={() => openPlayerModal(b.playerId, b.fullName, activeSideInfo.abbr)}
                                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                                    >
                                      <td className={`py-2 pl-3 pr-2 font-bold ${b.isSub ? 'pl-6 text-slate-500' : ''}`}>
                                        <span className="hover:text-sky-500">{b.fullName}</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400 font-semibold">{b.position}</span>
                                        {b.hr > 0 && (
                                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-black">
                                            {b.hr > 1 ? `${b.hr} HR` : 'HR'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-right">{b.ab}</td>
                                      <td className="py-2 px-2 text-right">{b.r}</td>
                                      <td className="py-2 px-2 text-right font-bold">{b.h}</td>
                                      <td className="py-2 px-2 text-right">{b.rbi}</td>
                                      <td className="py-2 px-2 text-right">{b.bb}</td>
                                      <td className="py-2 px-2 text-right">{b.so}</td>
                                      <td className="py-2 px-2 text-right text-slate-500">{b.avg}</td>
                                      <td className="py-2 pr-3 pl-2 text-right text-slate-500">{b.ops}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {activeSide.battingNotes?.length > 0 && (
                            <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
                              {activeSide.battingNotes.map((n, i) => (
                                <div key={i}>
                                  <strong className="text-slate-700 dark:text-slate-300">{n.label}:</strong> {n.value}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                            {activeSideInfo.name} Pitching
                          </h4>
                          {activeSide.pitchers.length === 0 ? (
                            <p className="text-xs text-slate-400">Pitching lines not posted yet.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                              <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                                    <th className="py-2 pl-3 pr-2 font-bold">Pitcher</th>
                                    <th className="py-2 px-2 font-bold text-right">IP</th>
                                    <th className="py-2 px-2 font-bold text-right">H</th>
                                    <th className="py-2 px-2 font-bold text-right">R</th>
                                    <th className="py-2 px-2 font-bold text-right">ER</th>
                                    <th className="py-2 px-2 font-bold text-right">BB</th>
                                    <th className="py-2 px-2 font-bold text-right">SO</th>
                                    <th className="py-2 px-2 font-bold text-right">HR</th>
                                    <th className="py-2 px-2 font-bold text-right">P-S</th>
                                    <th className="py-2 pr-3 pl-2 font-bold text-right">ERA</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {activeSide.pitchers.map((p, i) => (
                                    <tr
                                      key={`${p.playerId}-${i}`}
                                      onClick={() => openPlayerModal(p.playerId, p.fullName, activeSideInfo.abbr)}
                                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                                    >
                                      <td className="py-2 pl-3 pr-2 font-bold">
                                        <span className="hover:text-sky-500">{p.fullName}</span>
                                        {p.note && <span className="ml-1.5 text-[10px] text-sky-500 font-bold">{p.note}</span>}
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold">{p.ip}</td>
                                      <td className="py-2 px-2 text-right">{p.h}</td>
                                      <td className="py-2 px-2 text-right">{p.r}</td>
                                      <td className="py-2 px-2 text-right">{p.er}</td>
                                      <td className="py-2 px-2 text-right">{p.bb}</td>
                                      <td className="py-2 px-2 text-right font-bold">{p.so}</td>
                                      <td className="py-2 px-2 text-right">{p.hr}</td>
                                      <td className="py-2 px-2 text-right text-slate-500">
                                        {p.pitches !== null ? `${p.pitches}-${p.strikes ?? 0}` : '—'}
                                      </td>
                                      <td className="py-2 pr-3 pl-2 text-right text-slate-500">{p.era}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {boxScore.gameInfo?.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        {boxScore.gameInfo.map((gi, i) => (
                          <span key={i}>
                            <strong className="text-slate-600 dark:text-slate-300">{gi.label}:</strong> {gi.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end md:hidden"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white dark:bg-slate-900 p-5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-base">
                {myTeamsOnlyActive ? 'Edit My Teams' : 'Filter Teams & Divisions'}
              </h3>
              <button type="button" onClick={() => setMobileFilterOpen(false)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  type="button"
                  onClick={() => selectDivision(div)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  {div}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {MLB_TEAMS.map((t) => {
                const isSaved = savedMyTeams.includes(t.abbr);
                return (
                  <button
                    key={t.abbr}
                    type="button"
                    onClick={() => toggleTeam(t.abbr)}
                    className={`relative py-2 rounded-lg text-xs font-bold border ${
                      selectedTeams.includes(t.abbr)
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {t.abbr}
                    {isSaved && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveMyTeams}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold border border-sky-500 text-sky-500"
              >
                {selectedTeams.length > 0
                  ? `Save My Teams (${selectedTeams.length})`
                  : savedMyTeams.length > 0
                  ? 'Clear My Teams'
                  : 'Save My Teams'}
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-sky-600 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
          className="fixed bottom-20 lg:bottom-6 right-5 z-40 p-3 rounded-full bg-sky-600 hover:bg-sky-500 text-white shadow-xl shadow-sky-600/25 transition hover:-translate-y-0.5 animate-fade-up"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
