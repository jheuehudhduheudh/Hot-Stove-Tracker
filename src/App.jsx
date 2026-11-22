import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RefreshCw, Sun, Moon, Search, Filter, Download, Lock, Unlock,
  CheckCircle2, Clock, AlertTriangle, Users, Trophy, Flame,
  Plus, X, Edit3, ShieldAlert, ArrowLeftRight, Sparkles, Database,
  ExternalLink, DollarSign, Activity, Star, BarChart3, Calendar,
  ChevronLeft, ChevronRight, Award, Shield, Bookmark
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { MLB_TEAMS, DIVISIONS, getTeamInfo, decodeHtml } from './data/mlbData';

const FA_CLASS_YEARS = ['2026', '2025', '2024', '2023', '2022'];
const SEASON_YEARS = ['2026', '2025', '2024', '2023', '2022'];

const LEADER_LABELS = {
  homeRuns: 'Home Runs (HR)',
  battingAverage: 'Batting Average (AVG)',
  onBasePlusSlugging: 'OPS',
  runsBattedIn: 'Runs Batted In (RBI)',
  stolenBases: 'Stolen Bases (SB)',
  hits: 'Hits (H)',
  earnedRunAverage: 'ERA',
  whip: 'WHIP',
  strikeouts: 'Strikeouts (SO)',
  saves: 'Saves (SV)',
  wins: 'Wins (W)',
  inningsPitched: 'Innings Pitched (IP)',
};

function isFreeAgencyElection(tx) {
  const h = (tx?.headline || '').toLowerCase();
  return h.includes('elected free agency') || h.includes('declared free agency');
}

function getEffectiveMoveType(tx) {
  const h = (tx?.headline || '').toLowerCase();
  if (h.includes('injured list') || h.includes('10-day il') || h.includes('15-day il') || h.includes('60-day il') || h.includes('rehab assignment')) {
    return 'INJURED_LIST';
  }
  if (h.includes('recalled') || h.includes('optioned') || h.includes('selected the contract')) {
    return 'CALLUP_OPTION';
  }
  if (isFreeAgencyElection(tx)) return 'FREE_AGENCY';
  return tx?.move_type || 'SIGNING';
}

function shiftDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
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

function PlayerAvatar({ playerId, playerName, teamAbbr, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const team = getTeamInfo(teamAbbr);
  const initials = (playerName || team.abbr || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const dims = size === 'sm' ? 'w-10 h-10 text-xs' : size === 'lg' ? 'w-16 h-16 text-lg' : 'w-12 h-12 text-sm';

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800`}
      style={{ border: `2.5px solid ${team.color}` }}
    >
      {playerId && !imgError ? (
        <img
          src={`https://midfield.mlbstatic.com/v1/people/${playerId}/spots/120`}
          alt={playerName || 'Player'}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span style={{ color: team.color }} className="tracking-tight">
          {initials}
        </span>
      )}
    </div>
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
      localStorage.setItem('hst_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('hst_theme', 'light');
    }
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('feed');
  const [transactions, setTransactions] = useState([]);
  const [freeAgents, setFreeAgents] = useState([]);
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
  const [scoreDate, setScoreDate] = useState(() => new Date().toISOString().slice(0, 10));
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
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  // Team Hub Roster & Injured List state
  const [hubRoster, setHubRoster] = useState(null);
  const [loadingHubRoster, setLoadingHubRoster] = useState(false);
  const [hubRosterView, setHubRosterView] = useState('depth');

  // Spending Multi-Year Cycle state
  const [spendingCycle, setSpendingCycle] = useState('2026-27');
  const [spendingApiData, setSpendingApiData] = useState(null);
  const [loadingSpending, setLoadingSpending] = useState(false);

  // Player Year-by-Year Stats Modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);

  const [lastVisit] = useState(() => {
    const prev = localStorage.getItem('hst_last_visit');
    localStorage.setItem('hst_last_visit', new Date().toISOString());
    return prev ? new Date(prev).getTime() : Date.now() - 1000 * 60 * 60 * 12;
  });

  const [savedMyTeams, setSavedMyTeams] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_my_teams');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedTeams, setSelectedTeams] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_my_teams');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [myTeamsOnlyActive, setMyTeamsOnlyActive] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_my_teams');
      return saved ? JSON.parse(saved).length > 0 : false;
    } catch {
      return false;
    }
  });

  const [majorLeagueOnly, setMajorLeagueOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [faPositionFilter, setFaPositionFilter] = useState('ALL');
  const [hubTeam, setHubTeam] = useState('TOR');

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [newMoveModalOpen, setNewMoveModalOpen] = useState(false);

  const openTeamHub = (abbr) => {
    if (!abbr || abbr === 'MLB') return;
    setHubTeam(abbr);
    setActiveTab('teamHub');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleWatchlist = (playerId, playerName, e) => {
    if (e) e.stopPropagation();
    if (!playerId) return;
    setWatchlistIds((prev) => {
      const exists = prev.includes(playerId);
      const next = exists ? prev.filter((id) => id !== playerId) : [...prev, playerId];
      localStorage.setItem('hst_watchlist', JSON.stringify(next));
      return next;
    });
  };

  const openPlayerModal = async (playerId, playerName, teamAbbr) => {
    if (!playerId) return;
    setSelectedPlayer({ playerId, playerName, teamAbbr });
    setPlayerStats(null);
    setLoadingPlayerStats(true);
    try {
      const res = await fetch(`/api/player?id=${playerId}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerStats(data);
      }
    } catch {
      // Leave null if unreachable
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  const fetchTransactions = async (allowAutoSync = false) => {
    setLoading(true);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('reported_at', { ascending: false });

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
    setLoadingFreeAgents(true);
    try {
      const res = await fetch(
        `/api/free-agents?classYear=${encodeURIComponent(classParam)}&statMode=${encodeURIComponent(modeParam)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.freeAgents)) {
          setFreeAgents(data.freeAgents);
        }
      }
    } catch {
      // Leave empty
    } finally {
      setLoadingFreeAgents(false);
    }
  };

  const fetchScores = async (dateParam = scoreDate) => {
    setLoadingScores(true);
    try {
      const res = await fetch(`/api/season?type=scores&date=${encodeURIComponent(dateParam)}`);
      if (res.ok) {
        const data = await res.json();
        setGames(Array.isArray(data?.games) ? data.games : []);
      }
    } catch {
      setGames([]);
    } finally {
      setLoadingScores(false);
    }
  };

  const fetchStandings = async (seasonParam = standingsSeason) => {
    setLoadingStandings(true);
    try {
      const res = await fetch(`/api/season?type=standings&season=${encodeURIComponent(seasonParam)}`);
      if (res.ok) {
        const data = await res.json();
        setStandingsData({
          divisions: Array.isArray(data?.divisions) ? data.divisions : [],
          wildCard: Array.isArray(data?.wildCard) ? data.wildCard : [],
        });
      }
    } catch {
      setStandingsData({ divisions: [], wildCard: [] });
    } finally {
      setLoadingStandings(false);
    }
  };

  const fetchLeaders = async (seasonParam = leadersSeason) => {
    setLoadingLeaders(true);
    try {
      const res = await fetch(`/api/season?type=leaders&season=${encodeURIComponent(seasonParam)}`);
      if (res.ok) {
        const data = await res.json();
        setLeadersData({
          hitting: Array.isArray(data?.hitting) ? data.hitting : [],
          pitching: Array.isArray(data?.pitching) ? data.pitching : [],
        });
      }
    } catch {
      setLeadersData({ hitting: [], pitching: [] });
    } finally {
      setLoadingLeaders(false);
    }
  };

  useEffect(() => {
    fetchTransactions(true);
  }, []);

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
    if (activeTab === 'leaderboard') {
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
  }, [activeTab, spendingCycle]);

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
      if (majorLeagueOnly && !tx.is_major_league) return false;
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;

      const effType = getEffectiveMoveType(tx);
      if (typeFilter !== 'ALL' && effType !== typeFilter) return false;

      if (selectedTeams.length > 0) {
        const involved = [tx.to_team, tx.from_team, tx.team_a, tx.team_b].filter(Boolean);
        if (!involved.some((t) => selectedTeams.includes(t))) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${decodeHtml(tx.headline)} ${tx.player_name || ''} ${tx.to_team || ''} ${tx.from_team || ''} ${tx.contract_notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, majorLeagueOnly, statusFilter, typeFilter, selectedTeams, searchQuery]);

  const spendingLeaderboard = useMemo(() => {
    const totals = {};
    MLB_TEAMS.forEach((t) => {
      totals[t.abbr] = { team: t, totalMillions: 0, signingsCount: 0, totalMoves: 0 };
    });

    transactions.forEach((tx) => {
      if (tx.status === 'VOIDED') return;
      const teamKey = tx.to_team || tx.team_a;
      if (teamKey && totals[teamKey]) {
        totals[teamKey].totalMoves += 1;
        if (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') {
          totals[teamKey].totalMillions += Number(tx.total_value_millions || 0);
          totals[teamKey].signingsCount += 1;
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
    const totalSpent = spendingLeaderboard.reduce((sum, r) => sum + r.totalMillions, 0);
    const totalSignings = transactions.filter((t) => t.move_type === 'SIGNING' || t.move_type === 'EXTENSION').length;
    const totalTrades = transactions.filter((t) => t.move_type === 'TRADE').length;
    const mostActive = [...spendingLeaderboard].sort((a, b) => b.totalMoves - a.totalMoves)[0];
    return { totalSpent, totalSignings, totalTrades, mostActive };
  }, [transactions, spendingLeaderboard]);

  const filteredFreeAgents = useMemo(() => {
    const list = freeAgents.filter((fa) => {
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

  const toggleTeam = (abbr) => {
    setMyTeamsOnlyActive(false);
    setSelectedTeams((prev) =>
      prev.includes(abbr) ? prev.filter((t) => t !== abbr) : [...prev, abbr]
    );
  };

  const selectDivision = (div) => {
    setMyTeamsOnlyActive(false);
    const divAbbrs = MLB_TEAMS.filter((t) => t.division === div).map((t) => t.abbr);
    setSelectedTeams(divAbbrs);
  };

  const saveMyTeams = () => {
    localStorage.setItem('hst_my_teams', JSON.stringify(selectedTeams));
    setSavedMyTeams(selectedTeams);
    setMyTeamsOnlyActive(selectedTeams.length > 0);
    setSyncNotice(
      selectedTeams.length > 0
        ? `Saved ${selectedTeams.join(', ')} as My Teams preset`
        : 'Cleared saved My Teams preset'
    );
  };

  const toggleMyTeamsQuickFilter = () => {
    if (savedMyTeams.length === 0) {
      setTeamMenuOpen(true);
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
                `"${t.player_name || ''}"`,
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

  const handleAdminSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingTx) return;
    const updates = {
      status: editingTx.status,
      contract_years: editingTx.contract_years ? Number(editingTx.contract_years) : null,
      total_value_millions: editingTx.total_value_millions ? Number(editingTx.total_value_millions) : null,
      aav_millions:
        editingTx.contract_years && editingTx.total_value_millions
          ? Number((Number(editingTx.total_value_millions) / Number(editingTx.contract_years)).toFixed(2))
          : null,
      contract_notes: editingTx.contract_notes,
    };

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'update', payload: { id: editingTx.id, updates } }),
      });
      if (res.ok) {
        await fetchTransactions(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSyncNotice(errData.error || 'Admin update failed');
      }
    } catch (err) {
      setSyncNotice(`Admin update error: ${err.message}`);
    }
    setEditingTx(null);
  };

  const handleCreateMove = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const years = form.get('years') ? Number(form.get('years')) : null;
    const total = form.get('total') ? Number(form.get('total')) : null;
    const newTx = {
      status: form.get('status'),
      move_type: form.get('move_type'),
      is_major_league: true,
      headline: form.get('headline'),
      source_name: form.get('status') === 'OFFICIAL' ? 'MLB.com Official' : 'Insider Report',
      reported_at: new Date().toISOString(),
      player_name: form.get('player_name'),
      position: form.get('position') || 'MLB',
      from_team: form.get('from_team') || null,
      to_team: form.get('to_team'),
      stat_line: form.get('stat_line') || '',
      contract_years: years,
      total_value_millions: total,
      aav_millions: years && total ? Number((total / years).toFixed(2)) : null,
      contract_notes: form.get('notes') || '',
    };

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'create', payload: newTx }),
      });
      if (res.ok) {
        await fetchTransactions(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSyncNotice(errData.error || 'Admin create failed');
      }
    } catch (err) {
      setSyncNotice(`Admin create error: ${err.message}`);
    }
    setNewMoveModalOpen(false);
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
    <div className="min-h-screen pb-20 md:pb-12 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogo className="w-9 h-9" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold tracking-tight text-base sm:text-lg">
                  HOT STOVE TRACKER
                </h1>
                <span
                  className={`hidden xl:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isSupabaseConfigured
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  {isSupabaseConfigured ? 'Auto-Sync Live' : 'Demo Mode'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Year-Round MLB Dashboard • Synced: {formatMinutesAgo(lastSyncedAt)}
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {[
              { id: 'feed', label: 'Live Feed' },
              { id: 'freeAgents', label: `Free Agents (${freeAgents.length})` },
              { id: 'scoresStandings', label: 'Scores & Standings' },
              { id: 'leaders', label: 'League Leaders' },
              { id: 'teamHub', label: 'Team Hub' },
              { id: 'leaderboard', label: 'Spending' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setPlayerSearchOpen(true);
                setGlobalPlayerQuery('');
                setGlobalPlayerResults([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-sky-500 transition"
              title="Search any MLB player"
            >
              <Search className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden sm:inline">Search Player</span>
            </button>

            <button
              onClick={() => handleSyncNow(true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm disabled:opacity-60 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle Light/Dark Mode"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            <button
              onClick={() => (isAdmin ? setIsAdmin(false) : setAdminModalOpen(true))}
              aria-label="Admin Mode"
              className={`p-2 rounded-xl border transition ${
                isAdmin
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {isAdmin ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {syncNotice && (
        <div className="bg-sky-500/10 border-b border-sky-500/20 px-4 py-2 text-xs text-center text-sky-700 dark:text-sky-300 flex items-center justify-center gap-3">
          <span>{syncNotice}</span>
          <button
            onClick={() => setSyncNotice('')}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-6">
        {isAdmin && (
          <div className="mb-5 p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <Unlock className="w-4 h-4" />
              <span>Admin Mode Active — Click Edit on any card or post a manual breaking move.</span>
            </div>
            <button
              onClick={() => setNewMoveModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" /> Post Breaking Move
            </button>
          </div>
        )}

        {activeTab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search player, team, or contract..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <button
                    onClick={toggleMyTeamsQuickFilter}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition ${
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

                  <div className="relative hidden md:block">
                    <button
                      onClick={() => setTeamMenuOpen(!teamMenuOpen)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    >
                      <Filter className="w-4 h-4 text-sky-500" />
                      <span>
                        {selectedTeams.length === 0
                          ? 'All 30 Teams'
                          : `Teams (${selectedTeams.length})`}
                      </span>
                    </button>

                    {teamMenuOpen && (
                      <div className="absolute right-0 mt-2 w-[420px] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-40">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Division Presets
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveMyTeams}
                              className="text-xs font-semibold text-sky-500 hover:underline"
                            >
                              Save as My Teams
                            </button>
                            <button
                              onClick={() => {
                                setSelectedTeams([]);
                                setMyTeamsOnlyActive(false);
                              }}
                              className="text-xs text-slate-400 hover:text-slate-200"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {DIVISIONS.map((div) => (
                            <button
                              key={div}
                              onClick={() => selectDivision(div)}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-sky-500 hover:text-white transition"
                            >
                              {div}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 max-h-52 overflow-y-auto">
                          {MLB_TEAMS.map((t) => {
                            const active = selectedTeams.includes(t.abbr);
                            return (
                              <button
                                key={t.abbr}
                                onClick={() => toggleTeam(t.abbr)}
                                className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition ${
                                  active
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                                }`}
                              >
                                {t.abbr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setMobileFilterOpen(true)}
                    className="md:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  >
                    <Filter className="w-4 h-4 text-sky-500" />
                    <span>
                      Filters{selectedTeams.length ? ` (${selectedTeams.length})` : ''}
                    </span>
                  </button>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer select-none">
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
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button
                      onClick={() => exportData('json')}
                      title="Export JSON"
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    >
                      JSON
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: 'All Status' },
                      { id: 'REPORTED', label: 'Reported' },
                      { id: 'OFFICIAL', label: 'Official' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStatusFilter(s.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                          statusFilter === s.id
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: 'All Moves' },
                      { id: 'SIGNING', label: 'Signings' },
                      { id: 'TRADE', label: 'Trades' },
                      { id: 'EXTENSION', label: 'Extensions' },
                      { id: 'FREE_AGENCY', label: 'Free Agency' },
                      { id: 'INJURED_LIST', label: 'Injured List' },
                      { id: 'CALLUP_OPTION', label: 'Call-Ups / Options' },
                      { id: 'DFA_WAIVER', label: 'DFAs & Waivers' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTypeFilter(m.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                          typeFilter === m.id
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-16 text-slate-400 text-sm">Loading MLB transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
                  <p className="font-bold text-base text-slate-700 dark:text-slate-200">
                    No MLB transactions in your database yet
                  </p>
                  <button
                    onClick={() => handleSyncNow(true)}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white shadow"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    <span>{syncing ? 'Syncing Live MLB Data...' : 'Pull Live MLB Moves Now'}</span>
                  </button>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <p className="font-semibold text-slate-500">No transactions match your current filters.</p>
                  <button
                    onClick={() => {
                      setSelectedTeams([]);
                      setMyTeamsOnlyActive(false);
                      setStatusFilter('ALL');
                      setTypeFilter('ALL');
                      setSearchQuery('');
                      setMajorLeagueOnly(false);
                    }}
                    className="mt-2 text-xs font-bold text-sky-500 hover:underline"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTransactions.map((tx) => {
                    const destTeam = getTeamInfo(tx.to_team || tx.from_team);
                    const isNew = new Date(tx.reported_at).getTime() > lastVisit;
                    const stale = isStaleRumor(tx);
                    const cleanHeadline = decodeHtml(tx.headline);
                    const cleanNotes = decodeHtml(tx.contract_notes);
                    const effType = getEffectiveMoveType(tx);
                    const isWatchlisted = tx.player_id && watchlistIds.includes(tx.player_id);
                    const badgeLabel =
                      effType === 'FREE_AGENCY'
                        ? 'FREE AGENCY'
                        : effType === 'INJURED_LIST'
                        ? 'INJURED LIST'
                        : effType === 'CALLUP_OPTION'
                        ? 'CALL-UP / OPTION'
                        : effType.replace('_', ' ');

                    return (
                      <article
                        key={tx.id}
                        className="relative overflow-hidden p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition"
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
                              {isAdmin && (
                                <button
                                  onClick={() => setEditingTx(tx)}
                                  className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-sky-500 font-semibold"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                              )}
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
                                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60"
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <button
                                          onClick={() => openTeamHub(tInfo.abbr)}
                                          className="px-2 py-0.5 rounded text-xs font-black text-white hover:opacity-85 transition"
                                          style={{ backgroundColor: tInfo.color }}
                                          title={`Open ${tInfo.name} Team Hub`}
                                        >
                                          {tInfo.abbr}
                                        </button>
                                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                          {tInfo.short} Receive
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {side.list.map((p, i) => (
                                          <button
                                            key={i}
                                            type="button"
                                            onClick={() => openPlayerModal(p.playerId, p.playerName, side.teamAbbr)}
                                            className={`w-full flex items-center gap-2.5 text-left rounded-lg p-1 -m-1 transition ${
                                              p.playerId ? 'hover:bg-slate-200/60 dark:hover:bg-slate-800/70 cursor-pointer' : 'cursor-default'
                                            }`}
                                          >
                                            <PlayerAvatar
                                              playerId={p.playerId}
                                              playerName={p.playerName}
                                              teamAbbr={side.teamAbbr}
                                              size="sm"
                                            />
                                            <div className="text-sm font-bold flex items-center gap-1.5">
                                              <span className={p.playerId ? 'hover:text-sky-500' : ''}>{p.playerName}</span>
                                              <span className="text-[11px] font-semibold px-1.5 rounded bg-slate-200 dark:bg-slate-800">
                                                {p.position}
                                              </span>
                                            </div>
                                          </button>
                                        ))}
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
                                  onClick={() => openPlayerModal(tx.player_id, tx.player_name, destTeam.abbr)}
                                  className={tx.player_id ? 'cursor-pointer hover:scale-105 transition' : 'cursor-default'}
                                  title={tx.player_id ? 'View year-by-year stats' : undefined}
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
                                      className="px-2 py-0.5 rounded text-xs font-black text-white shrink-0 hover:opacity-85 transition"
                                      style={{ backgroundColor: destTeam.color }}
                                      title={`View ${destTeam.name} Hub`}
                                    >
                                      {destTeam.abbr}
                                    </button>
                                    <h2
                                      onClick={() => tx.player_id && openPlayerModal(tx.player_id, tx.player_name, destTeam.abbr)}
                                      className={`font-bold text-sm sm:text-base leading-snug ${
                                        tx.player_id ? 'cursor-pointer hover:text-sky-500 transition' : ''
                                      }`}
                                    >
                                      {cleanHeadline}
                                    </h2>
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
                                    </div>
                                  )}
                                </div>
                              </div>

                              {(tx.contract_years || tx.total_value_millions > 0) && (
                                <div className="flex sm:flex-col items-end justify-end gap-1 shrink-0">
                                  <span className="px-3 py-1 rounded-xl text-xs sm:text-sm font-extrabold bg-sky-500/15 text-sky-700 dark:text-sky-300">
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
              )}
            </div>

            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4 sticky top-20">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <Activity className="w-4 h-4 text-sky-500" />
                  <span>Hot Stove Pulse</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black text-sky-500">{transactions.length}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">MLB Moves</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black text-emerald-500">
                      ${leagueStats.totalSpent.toFixed(1)}M
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold">Tracked Deals</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black">{leagueStats.totalSignings}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">Signings</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="text-xl font-black">{leagueStats.totalTrades}</div>
                    <div className="text-[11px] text-slate-500 font-semibold">Trades</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Most Active Clubs
                  </span>
                  <button
                    onClick={() => setActiveTab('leaderboard')}
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
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-9 text-center py-0.5 rounded text-[11px] font-black text-white"
                          style={{ backgroundColor: row.team.color }}
                        >
                          {row.team.abbr}
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

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
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
                {loadingFreeAgents ? (
                  <p className="text-xs text-slate-400">Loading MLB free agents...</p>
                ) : freeAgents.length === 0 ? (
                  <p className="text-xs text-slate-400">No free agents listed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {freeAgents.slice(0, 6).map((fa) => (
                      <button
                        key={fa.playerId}
                        type="button"
                        onClick={() => openPlayerModal(fa.playerId, fa.fullName, fa.lastTeam)}
                        className="w-full flex items-center gap-2.5 p-1.5 -mx-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left transition"
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
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">{selectedFaClass} MLB Free Agent Class</h2>
                  <p className="text-xs text-slate-500">
                    {selectedFaClass} offseason free agents • Showing {faStatMode === 'career' ? 'Career MLB' : `${selectedFaClass} MLB`} stats
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl">
                    {FA_CLASS_YEARS.map((yr) => (
                      <button
                        key={yr}
                        onClick={() => {
                          setSelectedFaClass(yr);
                          setFaSignedFilter(yr === '2026' ? 'UNSIGNED' : 'ALL');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          selectedFaClass === yr
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl">
                    {[
                      { id: 'season', label: `${selectedFaClass} Stats` },
                      { id: 'career', label: 'Career' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setFaStatMode(m.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          faStatMode === m.id
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
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
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <button
                    onClick={() => setWatchlistOnly((w) => !w)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      watchlistOnly
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${watchlistOnly ? 'fill-current' : ''}`} />
                    <span>Watchlist ({watchlistIds.length})</span>
                  </button>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'UNSIGNED', label: 'Unsigned' },
                      { id: 'SIGNED', label: 'Signed' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setFaSignedFilter(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          faSignedFilter === st.id
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['ALL', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setFaPositionFilter(pos)}
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        faPositionFilter === pos
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingFreeAgents ? (
              <div className="text-center py-16 text-sm text-slate-400">
                Fetching {selectedFaClass} MLB free agent class &amp; {faStatMode === 'career' ? 'career' : selectedFaClass} stats...
              </div>
            ) : filteredFreeAgents.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <p className="text-sm font-semibold text-slate-500">
                  No matching unsigned free agents found.
                </p>
                <button
                  onClick={() => {
                    setWatchlistOnly(false);
                    setFaPositionFilter('ALL');
                    setFaSearch('');
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
                  return (
                    <div
                      key={fa.playerId || idx}
                      onClick={() => openPlayerModal(fa.playerId, fa.fullName, fa.lastTeam)}
                      className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 flex items-center justify-between gap-3 hover:border-sky-500/50 cursor-pointer transition shadow-sm ${
                        pinned ? 'border-amber-500/40' : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          playerId={fa.playerId}
                          playerName={fa.fullName}
                          teamAbbr={fa.lastTeam}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                            <span className="truncate">{fa.fullName}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold shrink-0">
                              {fa.position}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <span>Age {fa.age}</span>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTeamHub(prevTeam.abbr);
                              }}
                              className="px-1.5 py-0.2 rounded text-[10px] font-black text-white hover:opacity-85"
                              style={{ backgroundColor: prevTeam.color }}
                              title="Previous club"
                            >
                              {prevTeam.abbr}
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
                                    className="px-1.5 py-0.2 rounded text-[10px] font-black text-white hover:opacity-85"
                                    style={{ backgroundColor: newTeamInfo.color }}
                                    title={`Signed with ${newTeamInfo.name}`}
                                  >
                                    {newTeamInfo.abbr}
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 truncate">
                            {fa.statLine}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
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
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${getTierBadgeStyle(fa.tier)}`}
                        >
                          {fa.tier}
                        </span>
                      </div>
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
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-sky-500" />
                    <span>MLB Scoreboard &amp; Schedule</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Spring Training, Regular Season &amp; Postseason scores with probable pitchers and decisions
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setScoreDate((d) => shiftDateStr(d, -1))}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={scoreDate}
                    onChange={(e) => e.target.value && setScoreDate(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <button
                    onClick={() => setScoreDate((d) => shiftDateStr(d, 1))}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-sky-500"
                    title="Next Day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setScoreDate(new Date().toISOString().slice(0, 10))}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-500"
                  >
                    Today
                  </button>
                </div>
              </div>

              {loadingScores ? (
                <div className="text-center py-10 text-sm text-slate-400">Loading MLB schedule...</div>
              ) : games.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-1">
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    No MLB games scheduled for {scoreDate}
                  </p>
                  <p className="text-xs text-slate-400">
                    Use the date picker above to jump to Spring Training, Opening Day, or any past game date.
                  </p>
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
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
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
                                onClick={() => openTeamHub(info.abbr)}
                                className="flex items-center gap-2.5 text-left hover:opacity-85"
                              >
                                <span
                                  className="w-10 text-center py-0.5 rounded text-xs font-black text-white"
                                  style={{ backgroundColor: info.color }}
                                >
                                  {info.abbr}
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

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 truncate">
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">MLB Standings</h2>
                  <p className="text-xs text-slate-500">
                    Regular-season Division &amp; Wild Card standings ({standingsSeason})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {[
                      { id: 'divisions', label: 'Divisions' },
                      { id: 'wildCard', label: 'Wild Card' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setStandingsView(v.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          standingsView === v.id
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {SEASON_YEARS.map((yr) => (
                      <button
                        key={yr}
                        onClick={() => setStandingsSeason(yr)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          standingsSeason === yr
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingStandings ? (
                <div className="text-center py-12 text-sm text-slate-400">Loading {standingsSeason} MLB standings...</div>
              ) : (
                <div className={`grid grid-cols-1 ${standingsView === 'wildCard' ? 'lg:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3'} gap-4`}>
                  {(standingsView === 'wildCard' ? standingsData.wildCard : standingsData.divisions).map((group, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
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
                              const isWcCutoff = standingsView === 'wildCard' && tIdx === 2;
                              return (
                                <tr
                                  key={t.abbr}
                                  onClick={() => openTeamHub(t.abbr)}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition ${
                                    isWcCutoff ? 'border-b-2 border-b-sky-500/60' : ''
                                  }`}
                                >
                                  <td className="py-2.5 pl-4 pr-2 font-bold flex items-center gap-2">
                                    <span
                                      className="w-8 text-center py-0.5 rounded text-[10px] font-black text-white shrink-0"
                                      style={{ backgroundColor: tInfo.color }}
                                    >
                                      {tInfo.abbr}
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
          <div className="space-y-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span>MLB League Leaders ({leadersSeason})</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Official MLB Stats API top-10 leaderboards • Click any player for full career stats
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {[
                    { id: 'hitting', label: 'Hitting' },
                    { id: 'pitching', label: 'Pitching' },
                  ].map((grp) => (
                    <button
                      key={grp.id}
                      onClick={() => setLeadersGroup(grp.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        leadersGroup === grp.id
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {grp.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {SEASON_YEARS.map((yr) => (
                    <button
                      key={yr}
                      onClick={() => setLeadersSeason(yr)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        leadersSeason === yr
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingLeaders ? (
              <div className="text-center py-16 text-sm text-slate-400">
                Loading {leadersSeason} MLB {leadersGroup} leaders...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(leadersData[leadersGroup] || []).map((board) => {
                  const topPlayer = board.leaders?.[0];
                  const topTeam = topPlayer ? getTeamInfo(topPlayer.teamAbbr) : null;
                  return (
                    <div
                      key={board.category}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between">
                        <h3 className="font-extrabold text-sm">
                          {LEADER_LABELS[board.category] || board.category}
                        </h3>
                        <span className="text-[11px] font-bold text-slate-400">{leadersSeason}</span>
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
                              <div className="text-[10px] font-black uppercase text-amber-500">#1 Leader</div>
                              <div className="font-extrabold text-sm truncate">{topPlayer.fullName}</div>
                              <span
                                className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-black text-white"
                                style={{ backgroundColor: topTeam.color }}
                              >
                                {topTeam.abbr}
                              </span>
                            </div>
                          </div>
                          <div className="text-2xl font-black text-sky-500 shrink-0">
                            {topPlayer.value}
                          </div>
                        </div>
                      )}

                      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {(board.leaders || []).slice(1, 10).map((item, idx) => {
                          const tInfo = getTeamInfo(item.teamAbbr);
                          return (
                            <div
                              key={`${item.playerId}-${idx}`}
                              onClick={() => openPlayerModal(item.playerId, item.fullName, item.teamAbbr)}
                              className="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 font-bold text-slate-400">{item.rank}.</span>
                                <span className="font-bold truncate">{item.fullName}</span>
                                <span
                                  className="px-1.5 py-0.2 rounded text-[10px] font-black text-white shrink-0"
                                  style={{ backgroundColor: tInfo.color }}
                                >
                                  {tInfo.abbr}
                                </span>
                              </div>
                              <span className="font-extrabold text-slate-700 dark:text-slate-200 ml-2">
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

        {/* Team Hub Tab with Live Active Roster, Depth Chart & Injured List */}
        {activeTab === 'teamHub' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">30-Team Clubhouse &amp; Transaction Hub</h2>
                <p className="text-xs text-slate-500">Live roster, Injured List, depth chart &amp; offseason moves</p>
              </div>
              <select
                value={hubTeam}
                onChange={(e) => setHubTeam(e.target.value)}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              >
                {MLB_TEAMS.map((t) => (
                  <option key={t.abbr} value={t.abbr}>
                    {t.name} ({t.abbr})
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const info = getTeamInfo(hubTeam);
              const additions = transactions.filter(
                (t) => t.status !== 'VOIDED' && (t.to_team === hubTeam || t.team_a === hubTeam)
              );
              const subtractions = transactions.filter(
                (t) => t.status !== 'VOIDED' && (t.from_team === hubTeam || t.team_b === hubTeam)
              );
              return (
                <div className="space-y-4">
                  <div
                    className="p-6 rounded-2xl text-white flex flex-wrap items-center justify-between gap-4 shadow-lg"
                    style={{ backgroundColor: info.color }}
                  >
                    <div>
                      <span className="text-xs uppercase font-bold opacity-85">{info.division}</span>
                      <h3 className="text-2xl sm:text-3xl font-black">{info.name}</h3>
                      {hubRoster?.record && (
                        <p className="text-xs font-bold opacity-90 mt-1">
                          {hubRoster.record.season} Record: {hubRoster.record.wins}-{hubRoster.record.losses} ({hubRoster.record.pct}) • Div Rank #{hubRoster.record.divRank} • Streak {hubRoster.record.streak}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-5 text-right">
                      <div>
                        <div className="text-2xl sm:text-3xl font-black">{hubRoster?.activeCount ?? '—'}</div>
                        <div className="text-[11px] opacity-90 font-semibold">{hubRoster?.rosterSource || 'Roster'}</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-black">{hubRoster?.ilCount ?? 0}</div>
                        <div className="text-[11px] opacity-90 font-semibold">On IL</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-black">{additions.length}</div>
                        <div className="text-[11px] opacity-90 font-semibold">Logged Moves</div>
                      </div>
                    </div>
                  </div>

                  {/* Live Active Roster / Depth Chart & Injured List */}
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-base flex items-center gap-2">
                          <Shield className="w-4 h-4 text-sky-500" />
                          <span>{info.short} Live Roster &amp; Injured List</span>
                        </h4>
                        <p className="text-xs text-slate-500">
                          Click any player for full year-by-year MLB career stats
                        </p>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        {[
                          { id: 'depth', label: 'Depth Chart' },
                          { id: 'il', label: `Injured List (${hubRoster?.ilCount ?? 0})` },
                          { id: 'all', label: `Full Roster (${hubRoster?.activeCount ?? 0})` },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setHubRosterView(tab.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                              hubRosterView === tab.id
                                ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {loadingHubRoster ? (
                      <div className="text-center py-8 text-xs text-slate-400">Loading {info.short} live roster...</div>
                    ) : !hubRoster ? (
                      <div className="text-center py-8 text-xs text-slate-400">Roster data unavailable right now.</div>
                    ) : hubRosterView === 'il' ? (
                      hubRoster.injuredList.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 text-center">
                          No players currently listed on the {info.short} Injured List.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {hubRoster.injuredList.map((p) => (
                            <button
                              key={p.playerId}
                              type="button"
                              onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                              className="p-3 rounded-xl border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 flex items-center justify-between text-left transition"
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
                        ].map((grp) => (
                          <div key={grp.key} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-2">
                            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                              <span>{grp.label}</span>
                              <span>{(hubRoster.depthChart?.[grp.key] || []).length}</span>
                            </div>
                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                              {(hubRoster.depthChart?.[grp.key] || []).map((p) => (
                                <button
                                  key={p.playerId}
                                  type="button"
                                  onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                                  className="w-full flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/80 text-left transition"
                                >
                                  <span className="font-bold truncate">
                                    {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.fullName}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ml-1 shrink-0">
                                    {p.position}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {hubRoster.activePlayers.map((p) => (
                          <button
                            key={p.playerId}
                            type="button"
                            onClick={() => openPlayerModal(p.playerId, p.fullName, hubTeam)}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 hover:border-sky-500/40 flex items-center gap-2.5 text-left transition"
                          >
                            <PlayerAvatar playerId={p.playerId} playerName={p.fullName} teamAbbr={hubTeam} size="sm" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-500 mb-3">
                        Additions &amp; Club Activity ({additions.length})
                      </h4>
                      {additions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged moves yet.</p>
                      ) : (
                        <ul className="space-y-2.5 text-sm">
                          {additions.map((a) => (
                            <li
                              key={a.id}
                              onClick={() => a.player_id && openPlayerModal(a.player_id, a.player_name, hubTeam)}
                              className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 ${
                                a.player_id ? 'cursor-pointer hover:border-sky-500/40' : ''
                              }`}
                            >
                              <div className="font-bold">{decodeHtml(a.headline)}</div>
                              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                <span>{a.status}</span>
                                <span>•</span>
                                <span>{new Date(a.reported_at).toLocaleDateString()}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-rose-500 mb-3">
                        Departures &amp; Releases ({subtractions.length})
                      </h4>
                      {subtractions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged departures yet.</p>
                      ) : (
                        <ul className="space-y-2.5 text-sm">
                          {subtractions.map((s) => (
                            <li
                              key={s.id}
                              onClick={() => s.player_id && openPlayerModal(s.player_id, s.player_name, hubTeam)}
                              className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 ${
                                s.player_id ? 'cursor-pointer hover:border-sky-500/40' : ''
                              }`}
                            >
                              <div className="font-bold">{decodeHtml(s.headline)}</div>
                              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                <span>{s.status}</span>
                                <span>•</span>
                                <span>{new Date(s.reported_at).toLocaleDateString()}</span>
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

        {/* Spending Tab with Offseason Year Switcher */}
        {activeTab === 'leaderboard' && (() => {
          const activeRows =
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
          const displayMoves = spendingApiData ? spendingApiData.totalMoves : transactions.length;
          const topClub = [...activeRows].sort((a, b) => b.totalMoves - a.totalMoves)[0];
          const cycleMaxSpend = Math.max(1, ...activeRows.map((r) => r.totalMillions));

          return (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">Offseason Spending &amp; Activity ({spendingCycle})</h2>
                  <p className="text-xs text-slate-500">
                    {spendingApiData?.dataSource || 'Sorted by disclosed contract dollars, then total roster moves'}
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {['2026-27', '2025-26', '2024-25', '2023-24'].map((cyc) => (
                    <button
                      key={cyc}
                      onClick={() => setSpendingCycle(cyc)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        spendingCycle === cyc
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cyc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl font-black">${Number(displaySpent || 0).toFixed(1)}M</div>
                    <div className="text-xs text-slate-500">Disclosed Commitments ({spendingCycle})</div>
                  </div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl font-black">{displayMoves}</div>
                    <div className="text-xs text-slate-500">MLB Moves in {spendingCycle}</div>
                  </div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
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

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                {loadingSpending ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    Loading {spendingCycle} MLB offseason activity...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-slate-100 dark:bg-slate-800">
                    {activeRows.map((row, idx) => {
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
                                className="w-10 text-center py-0.5 rounded text-xs font-black text-white"
                                style={{ backgroundColor: row.team.color }}
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
            </div>
          );
        })()}
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur grid grid-cols-6 py-2">
        {[
          { id: 'feed', label: 'Feed', icon: Flame },
          { id: 'freeAgents', label: 'Agents', icon: Users },
          { id: 'scoresStandings', label: 'Scores', icon: Calendar },
          { id: 'leaders', label: 'Leaders', icon: Award },
          { id: 'teamHub', label: 'Teams', icon: ArrowLeftRight },
          { id: 'leaderboard', label: 'Spend', icon: Trophy },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${
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
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
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
                <div className="py-10 text-center text-xs text-slate-400">
                  Type at least 2 letters to search active and historical MLB players.
                </div>
              ) : searchingPlayers ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Searching MLB Stats API...
                </div>
              ) : globalPlayerResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No MLB players found matching &ldquo;{globalPlayerQuery}&rdquo;.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalPlayerResults.map((p) => {
                    const tInfo = p.teamAbbr ? getTeamInfo(p.teamAbbr) : null;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPlayerSearchOpen(false);
                          openPlayerModal(p.id, p.fullName, p.teamAbbr || 'MLB');
                        }}
                        className="w-full p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-3 text-left transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar
                            playerId={p.id}
                            playerName={p.fullName}
                            teamAbbr={p.teamAbbr || 'MLB'}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                              <span>{p.fullName}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                                {p.position}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                              {tInfo ? (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[10px] font-black text-white"
                                  style={{ backgroundColor: tInfo.color }}
                                >
                                  {tInfo.abbr}
                                </span>
                              ) : (
                                <span>{p.teamName}</span>
                              )}
                              {p.age && <span>• Age {p.age}</span>}
                              {p.mlbDebutDate && <span>• Debut {p.mlbDebutDate.slice(0, 4)}</span>}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            p.active
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-slate-500/15 text-slate-400'
                          }`}
                        >
                          {p.active ? 'Active' : 'Historical'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clickable Player Year-by-Year Stats Modal */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <PlayerAvatar
                  playerId={selectedPlayer.playerId}
                  playerName={playerStats?.fullName || selectedPlayer.playerName}
                  teamAbbr={selectedPlayer.teamAbbr}
                  size="lg"
                />
                <div>
                  <h3 className="text-lg sm:text-xl font-black">
                    {playerStats?.fullName || selectedPlayer.playerName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {playerStats?.position && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200">
                        {playerStats.position}
                      </span>
                    )}
                    {playerStats?.age && <span>Age {playerStats.age}</span>}
                    {playerStats?.bats && playerStats?.throws && (
                      <span>• B/T: {playerStats.bats}/{playerStats.throws}</span>
                    )}
                    {playerStats?.height && (
                      <span>• {playerStats.height} / {playerStats.weight} lbs</span>
                    )}
                  </div>
                  {playerStats?.links && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <a
                        href={playerStats.links.mlb}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25"
                      >
                        MLB.com <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={playerStats.links.savant}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                      >
                        Baseball Savant <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={playerStats.links.bref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
                      >
                        Baseball-Ref <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {loadingPlayerStats ? (
                <div className="text-center py-10 text-sm text-slate-400">
                  Loading MLB year-by-year stats...
                </div>
              ) : !playerStats || playerStats.seasons.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">
                  No official MLB regular-season stats found for this player.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                        <th className="py-2 pr-3 font-bold">Year</th>
                        <th className="py-2 pr-3 font-bold">Team</th>
                        {playerStats.isPitcher ? (
                          <>
                            <th className="py-2 px-2 font-bold text-right">W-L</th>
                            <th className="py-2 px-2 font-bold text-right">ERA</th>
                            <th className="py-2 px-2 font-bold text-right">G</th>
                            <th className="py-2 px-2 font-bold text-right">IP</th>
                            <th className="py-2 px-2 font-bold text-right">SO</th>
                            <th className="py-2 px-2 font-bold text-right">WHIP</th>
                            <th className="py-2 pl-2 font-bold text-right">SV</th>
                          </>
                        ) : (
                          <>
                            <th className="py-2 px-2 font-bold text-right">G</th>
                            <th className="py-2 px-2 font-bold text-right">AB</th>
                            <th className="py-2 px-2 font-bold text-right">AVG</th>
                            <th className="py-2 px-2 font-bold text-right">HR</th>
                            <th className="py-2 px-2 font-bold text-right">RBI</th>
                            <th className="py-2 px-2 font-bold text-right">SB</th>
                            <th className="py-2 pl-2 font-bold text-right">OPS</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {playerStats.seasons.map((row, i) => (
                        <tr key={`${row.season}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 pr-3 font-extrabold">{row.season}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-500">{row.team}</td>
                          {playerStats.isPitcher ? (
                            <>
                              <td className="py-2 px-2 text-right">{row.stat.wins ?? 0}-{row.stat.losses ?? 0}</td>
                              <td className="py-2 px-2 text-right font-bold">{row.stat.era ?? '—'}</td>
                              <td className="py-2 px-2 text-right">{row.stat.gamesPlayed ?? 0}</td>
                              <td className="py-2 px-2 text-right">{row.stat.inningsPitched ?? '0.0'}</td>
                              <td className="py-2 px-2 text-right">{row.stat.strikeOuts ?? 0}</td>
                              <td className="py-2 px-2 text-right">{row.stat.whip ?? '—'}</td>
                              <td className="py-2 pl-2 text-right">{row.stat.saves ?? 0}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 px-2 text-right">{row.stat.gamesPlayed ?? 0}</td>
                              <td className="py-2 px-2 text-right">{row.stat.atBats ?? 0}</td>
                              <td className="py-2 px-2 text-right font-bold">{row.stat.avg ?? '—'}</td>
                              <td className="py-2 px-2 text-right">{row.stat.homeRuns ?? 0}</td>
                              <td className="py-2 px-2 text-right">{row.stat.rbi ?? 0}</td>
                              <td className="py-2 px-2 text-right">{row.stat.stolenBases ?? 0}</td>
                              <td className="py-2 pl-2 text-right font-bold text-sky-600 dark:text-sky-400">{row.stat.ops ?? '—'}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {playerStats.career && (
                        <tr className="bg-slate-100/80 dark:bg-slate-800/70 font-extrabold">
                          <td className="py-2.5 pr-3">Career</td>
                          <td className="py-2.5 pr-3 text-slate-500">MLB</td>
                          {playerStats.isPitcher ? (
                            <>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.wins ?? 0}-{playerStats.career.losses ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.era ?? '—'}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.gamesPlayed ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.inningsPitched ?? '0.0'}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.strikeOuts ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.whip ?? '—'}</td>
                              <td className="py-2.5 pl-2 text-right">{playerStats.career.saves ?? 0}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.gamesPlayed ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.atBats ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.avg ?? '—'}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.homeRuns ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.rbi ?? 0}</td>
                              <td className="py-2.5 px-2 text-right">{playerStats.career.stolenBases ?? 0}</td>
                              <td className="py-2.5 pl-2 text-right text-sky-600 dark:text-sky-400">{playerStats.career.ops ?? '—'}</td>
                            </>
                          )}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:hidden">
          <div className="w-full rounded-t-3xl bg-white dark:bg-slate-900 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-base">Filter Teams &amp; Divisions</h3>
              <button onClick={() => setMobileFilterOpen(false)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  onClick={() => selectDivision(div)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  {div}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {MLB_TEAMS.map((t) => (
                <button
                  key={t.abbr}
                  onClick={() => toggleTeam(t.abbr)}
                  className={`py-2 rounded-lg text-xs font-bold border ${
                    selectedTeams.includes(t.abbr)
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {t.abbr}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveMyTeams}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-sky-500 text-sky-500"
              >
                Save My Teams
              </button>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-sky-600 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {adminModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold">Unlock Admin Controls</h3>
              <button onClick={() => setAdminModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter ADMIN_PASSWORD"
              className="w-full px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent mb-3"
            />
            <button
              onClick={() => {
                setIsAdmin(true);
                setAdminModalOpen(false);
              }}
              className="w-full py-2 rounded-xl bg-sky-600 text-white text-sm font-bold"
            >
              Unlock
            </button>
          </div>
        </div>
      )}

      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleAdminSaveEdit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold">Edit Transaction</h3>
              <button type="button" onClick={() => setEditingTx(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <select
              value={editingTx.status}
              onChange={(e) => setEditingTx({ ...editingTx, status: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="REPORTED">REPORTED</option>
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="VOIDED">VOIDED / FELL THROUGH</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Years"
                value={editingTx.contract_years || ''}
                onChange={(e) => setEditingTx({ ...editingTx, contract_years: e.target.value })}
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Total ($M)"
                value={editingTx.total_value_millions || ''}
                onChange={(e) => setEditingTx({ ...editingTx, total_value_millions: e.target.value })}
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <input
              type="text"
              placeholder="Contract notes (e.g., Opt-out after Year 2)"
              value={editingTx.contract_notes || ''}
              onChange={(e) => setEditingTx({ ...editingTx, contract_notes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <button type="submit" className="w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              Save Changes
            </button>
          </form>
        </div>
      )}

      {newMoveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateMove}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" /> Post Breaking Move
              </h3>
              <button type="button" onClick={() => setNewMoveModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              name="headline"
              required
              placeholder="Headline"
              className="w-full px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="player_name"
                required
                placeholder="Player Name"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
              <input
                name="to_team"
                required
                placeholder="New Team (e.g., TOR)"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                name="status"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="REPORTED">REPORTED</option>
                <option value="OFFICIAL">OFFICIAL</option>
              </select>
              <select
                name="move_type"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="SIGNING">SIGNING</option>
                <option value="TRADE">TRADE</option>
                <option value="EXTENSION">EXTENSION</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="years"
                type="number"
                placeholder="Years"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
              <input
                name="total"
                type="number"
                step="0.1"
                placeholder="Total ($M)"
                className="px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <input
              name="notes"
              placeholder="Notes (e.g., Pending physical)"
              className="w-full px-3 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <button type="submit" className="w-full py-2 rounded-xl bg-sky-600 text-white text-sm font-bold">
              Publish Move
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
