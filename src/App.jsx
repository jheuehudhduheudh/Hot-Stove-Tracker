import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Sun, Moon, Search, Filter, Download, Lock, Unlock,
  CheckCircle2, Clock, AlertTriangle, Users, Trophy, Flame,
  Plus, X, Edit3, ShieldAlert, ArrowLeftRight, Sparkles, Database
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { MLB_TEAMS, DIVISIONS, getTeamInfo } from './data/mlbData';

function PlayerAvatar({ playerId, playerName, teamAbbr, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const team = getTeamInfo(teamAbbr);
  const initials = (playerName || 'ML')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const dims = size === 'sm' ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm';

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800`}
      style={{ border: `2.5px solid ${team.color}` }}
    >
      {playerId && !imgError ? (
        <img
          src={`https://midfield.mlbstatic.com/v1/people/${playerId}/spots/120`}
          alt={playerName}
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
  const [loadingFreeAgents, setLoadingFreeAgents] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncNotice, setSyncNotice] = useState('');

  const [lastVisit] = useState(() => {
    const prev = localStorage.getItem('hst_last_visit');
    localStorage.setItem('hst_last_visit', new Date().toISOString());
    return prev ? new Date(prev).getTime() : Date.now() - 1000 * 60 * 60 * 12;
  });

  const [selectedTeams, setSelectedTeams] = useState(() => {
    try {
      const saved = localStorage.getItem('hst_my_teams');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
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

  const fetchTransactions = async () => {
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
        if (meta?.last_synced_at) setLastSyncedAt(meta.last_synced_at);
        setLoading(false);
        return;
      } else if (error) {
        setSyncNotice(`Supabase read error: ${error.message}`);
      }
    }

    const localCached = localStorage.getItem('hst_demo_transactions');
    if (localCached) {
      setTransactions(JSON.parse(localCached));
    } else {
      setTransactions([]);
    }
    setLoading(false);
  };

  const fetchFreeAgents = async () => {
    setLoadingFreeAgents(true);
    const currentYear = new Date().getFullYear();
    const seasonsToTry = [currentYear + 1, currentYear];

    for (const season of seasonsToTry) {
      try {
        const res = await fetch(`https://statsapi.mlb.com/api/v1/people/freeAgents?season=${season}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data?.freeAgents) && data.freeAgents.length > 0) {
          const mapped = data.freeAgents
            .filter((fa) => !fa.newTeam)
            .slice(0, 100)
            .map((fa) => ({
              playerId: fa.player?.id,
              fullName: fa.player?.fullName || 'Unknown Player',
              position: fa.position?.abbreviation || 'MLB',
              age: fa.player?.currentAge || '—',
              lastTeam: getTeamInfo(fa.originalTeam?.name || '').abbr,
              statLine: `${season} MLB Free Agent`,
              tier: 'Available',
            }));
          setFreeAgents(mapped);
          setLoadingFreeAgents(false);
          return;
        }
      } catch {
        // Try next season fallback
      }
    }
    setLoadingFreeAgents(false);
  };

  useEffect(() => {
    fetchTransactions();
    fetchFreeAgents();
  }, []);

  const handleSyncNow = async (force = false) => {
    setSyncing(true);
    setSyncNotice('');
    try {
      const res = await fetch(`/api/sync${force ? '?force=true' : ''}`, { method: 'POST' });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        if (result.skipped) {
          setSyncNotice(`Already up to date (cooldown: ${result.remainingSeconds}s left)`);
        } else {
          setSyncNotice(result.summary || 'Synced latest MLB moves!');
          await fetchTransactions();
        }
      } else {
        setSyncNotice(result.error || `Sync failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setSyncNotice(`Sync network error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (majorLeagueOnly && !tx.is_major_league) return false;
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && tx.move_type !== typeFilter) return false;

      if (selectedTeams.length > 0) {
        const involved = [tx.to_team, tx.from_team, tx.team_a, tx.team_b].filter(Boolean);
        if (!involved.some((t) => selectedTeams.includes(t))) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${tx.headline} ${tx.player_name || ''} ${tx.to_team || ''} ${tx.from_team || ''} ${tx.contract_notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, majorLeagueOnly, statusFilter, typeFilter, selectedTeams, searchQuery]);

  const spendingLeaderboard = useMemo(() => {
    const totals = {};
    MLB_TEAMS.forEach((t) => {
      totals[t.abbr] = { team: t, totalMillions: 0, signingsCount: 0 };
    });

    transactions.forEach((tx) => {
      if (
        tx.status !== 'VOIDED' &&
        (tx.move_type === 'SIGNING' || tx.move_type === 'EXTENSION') &&
        tx.to_team &&
        totals[tx.to_team]
      ) {
        totals[tx.to_team].totalMillions += Number(tx.total_value_millions || 0);
        totals[tx.to_team].signingsCount += 1;
      }
    });

    return Object.values(totals).sort((a, b) => b.totalMillions - a.totalMillions);
  }, [transactions]);

  const toggleTeam = (abbr) => {
    setSelectedTeams((prev) =>
      prev.includes(abbr) ? prev.filter((t) => t !== abbr) : [...prev, abbr]
    );
  };

  const selectDivision = (div) => {
    const divAbbrs = MLB_TEAMS.filter((t) => t.division === div).map((t) => t.abbr);
    setSelectedTeams(divAbbrs);
  };

  const saveMyTeams = () => {
    localStorage.setItem('hst_my_teams', JSON.stringify(selectedTeams));
    setSyncNotice(
      selectedTeams.length > 0
        ? `Saved ${selectedTeams.join(', ')} as My Teams preset`
        : 'Cleared saved My Teams preset'
    );
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
                t.move_type,
                `"${t.player_name || ''}"`,
                t.from_team || '',
                t.to_team || '',
                t.contract_years || '',
                t.total_value_millions || '',
                t.aav_millions || '',
                `"${(t.headline || '').replace(/"/g, '""')}"`,
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
        await fetchTransactions();
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
        await fetchTransactions();
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
    return mins === 0 ? 'Just now' : `${mins}m ago`;
  };

  const isStaleRumor = (tx) => {
    if (tx.status !== 'REPORTED') return false;
    const ageDays = (Date.now() - new Date(tx.reported_at).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > 14;
  };

  return (
    <div className="min-h-screen pb-20 md:pb-10 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white shadow">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold tracking-tight text-base sm:text-lg">
                  HOT STOVE TRACKER
                </h1>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isSupabaseConfigured
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  {isSupabaseConfigured ? 'Supabase Live' : 'Demo Mode'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                MLB Free Agency &amp; Trade Dashboard • Synced: {formatMinutesAgo(lastSyncedAt)}
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {[
              { id: 'feed', label: 'Live Feed' },
              { id: 'freeAgents', label: 'Best Free Agents' },
              { id: 'teamHub', label: 'Team Hub' },
              { id: 'leaderboard', label: 'Spending' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSyncNow(false)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm disabled:opacity-60 transition"
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
            onClick={() => handleSyncNow(true)}
            className="underline font-semibold hover:text-sky-500"
          >
            Force Refresh
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 pt-5">
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
          <>
            <div className="mb-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player, team, or contract..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="relative hidden md:block">
                  <button
                    onClick={() => setTeamMenuOpen(!teamMenuOpen)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500"
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
                            onClick={() => setSelectedTeams([])}
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
                  className="md:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <Filter className="w-4 h-4 text-sky-500" />
                  <span>
                    Filters{selectedTeams.length ? ` (${selectedTeams.length})` : ''}
                  </span>
                </button>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={majorLeagueOnly}
                    onChange={(e) => setMajorLeagueOnly(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Major League Moves Only</span>
                </label>

                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={() => exportData('csv')}
                    title="Export CSV"
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={() => exportData('json')}
                    title="Export JSON"
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500"
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'ALL', label: 'All Status' },
                    { id: 'REPORTED', label: 'Sources Say' },
                    { id: 'OFFICIAL', label: 'Official' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStatusFilter(s.id)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        statusFilter === s.id
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
                    { id: 'DFA_WAIVER', label: 'DFAs & Waivers' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTypeFilter(m.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                        typeFilter === m.id
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 space-y-3">
                <p className="font-bold text-base text-slate-700 dark:text-slate-200">
                  No MLB transactions in your database yet
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Click the button below to pull live MLB Trade Rumors reports and official MLB Stats API transactions into Supabase.
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
              <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                <p className="font-semibold text-slate-500">No transactions match your current filters.</p>
                <button
                  onClick={() => {
                    setSelectedTeams([]);
                    setStatusFilter('ALL');
                    setTypeFilter('ALL');
                    setSearchQuery('');
                    setMajorLeagueOnly(false);
                  }}
                  className="mt-2 text-xs font-bold text-sky-500 hover:underline"
                >
                  Reset all filters (including Minor League moves)
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredTransactions.map((tx) => {
                  const destTeam = getTeamInfo(tx.to_team);
                  const isNew = new Date(tx.reported_at).getTime() > lastVisit;
                  const stale = isStaleRumor(tx);

                  return (
                    <article
                      key={tx.id}
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {tx.status === 'OFFICIAL' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> OFFICIAL
                            </span>
                          )}
                          {tx.status === 'REPORTED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              <Clock className="w-3.5 h-3.5" /> REPORTED
                            </span>
                          )}
                          {tx.status === 'VOIDED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-500/15 text-rose-500">
                              <ShieldAlert className="w-3.5 h-3.5" /> VOIDED / FELL THROUGH
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {tx.move_type.replace('_', ' ')}
                          </span>

                          {isNew && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500 text-white">
                              NEW
                            </span>
                          )}

                          {stale && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-500">
                              <AlertTriangle className="w-3 h-3" /> Pending &gt;14 Days
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {tx.source_url ? (
                            <a
                              href={tx.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-sky-400 underline"
                            >
                              {tx.source_name}
                            </a>
                          ) : (
                            <span>{tx.source_name}</span>
                          )}
                          <span>•</span>
                          <span>{new Date(tx.reported_at).toLocaleDateString()}</span>
                          {isAdmin && (
                            <button
                              onClick={() => setEditingTx(tx)}
                              className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-sky-500 font-semibold"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          )}
                        </div>
                      </div>

                      {tx.move_type === 'TRADE' && (tx.team_a_receives?.length || tx.team_b_receives?.length) ? (
                        <div>
                          <h2 className="font-bold text-base sm:text-lg mb-3">{tx.headline}</h2>
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
                                  <div className="flex items-center gap-2 mb-2.5">
                                    <span
                                      className="px-2 py-0.5 rounded text-xs font-black text-white"
                                      style={{ backgroundColor: tInfo.color }}
                                    >
                                      {tInfo.abbr}
                                    </span>
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                      {tInfo.short} Receive
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {side.list.map((p, i) => (
                                      <div key={i} className="flex items-center gap-2.5">
                                        <PlayerAvatar
                                          playerId={p.playerId}
                                          playerName={p.playerName}
                                          teamAbbr={side.teamAbbr}
                                          size="sm"
                                        />
                                        <div>
                                          <div className="text-sm font-bold flex items-center gap-1.5">
                                            <span>{p.playerName}</span>
                                            <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800">
                                              {p.position}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                              {p.level}
                                            </span>
                                          </div>
                                          {p.statLine && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                              {p.statLine}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5">
                            <PlayerAvatar
                              playerId={tx.player_id}
                              playerName={tx.player_name}
                              teamAbbr={tx.to_team}
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="px-2 py-0.5 rounded text-xs font-black text-white"
                                  style={{ backgroundColor: destTeam.color }}
                                >
                                  {destTeam.abbr}
                                </span>
                                <h2 className="font-bold text-base sm:text-lg leading-snug">
                                  {tx.headline}
                                </h2>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {tx.position && (
                                  <span className="font-bold text-slate-700 dark:text-slate-200">
                                    {tx.position}
                                  </span>
                                )}
                                {tx.stat_line && (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                                    {tx.stat_line}
                                  </span>
                                )}
                                {tx.contract_notes && <span>• {tx.contract_notes}</span>}
                              </div>
                            </div>
                          </div>

                          {(tx.contract_years || tx.total_value_millions > 0) && (
                            <div className="flex sm:flex-col items-end justify-end gap-1.5 shrink-0">
                              <span className="px-3 py-1 rounded-xl text-sm font-extrabold bg-sky-500/15 text-sky-700 dark:text-sky-300">
                                {tx.contract_years ? `${tx.contract_years} yrs` : ''}{' '}
                                {tx.total_value_millions ? `/ $${tx.total_value_millions}M` : ''}
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
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'freeAgents' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-extrabold">MLB Free Agents (Live MLB Stats API)</h2>
                <p className="text-xs text-slate-500">Unsigned players currently listed by MLB Stats API</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setFaPositionFilter(pos)}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      faPositionFilter === pos
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {loadingFreeAgents ? (
              <div className="text-center py-12 text-sm text-slate-400">Fetching live MLB free agent list...</div>
            ) : freeAgents.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-sm text-slate-400">
                No unsigned free agents returned by MLB Stats API right now.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {freeAgents
                  .filter((fa) => faPositionFilter === 'ALL' || fa.position === faPositionFilter)
                  .map((fa, idx) => (
                    <div
                      key={fa.playerId || idx}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          playerId={fa.playerId}
                          playerName={fa.fullName}
                          teamAbbr={fa.lastTeam}
                        />
                        <div>
                          <div className="font-bold text-base flex items-center gap-2">
                            <span>{fa.fullName}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                              {fa.position}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Age {fa.age} • Prev: {fa.lastTeam} • {fa.statLine}
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                        {fa.tier}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'teamHub' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-extrabold">30-Team Offseason Hub</h2>
                <p className="text-xs text-slate-500">Select a club to review additions &amp; departures</p>
              </div>
              <select
                value={hubTeam}
                onChange={(e) => setHubTeam(e.target.value)}
                className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
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
                    className="p-5 rounded-2xl text-white flex items-center justify-between"
                    style={{ backgroundColor: info.color }}
                  >
                    <div>
                      <span className="text-xs uppercase font-bold opacity-80">{info.division}</span>
                      <h3 className="text-2xl font-black">{info.name}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black">{additions.length}</div>
                      <div className="text-xs opacity-85">Offseason Additions</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-500 mb-3">
                        Additions ({additions.length})
                      </h4>
                      {additions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged additions yet.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {additions.map((a) => (
                            <li key={a.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950">
                              <div className="font-bold">{a.headline}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{a.status}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-rose-500 mb-3">
                        Subtractions ({subtractions.length})
                      </h4>
                      {subtractions.length === 0 ? (
                        <p className="text-xs text-slate-400">No logged departures yet.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {subtractions.map((s) => (
                            <li key={s.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950">
                              <div className="font-bold">{s.headline}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{s.status}</div>
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

        {activeTab === 'leaderboard' && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-extrabold">Offseason Spending Leaderboard</h2>
              <p className="text-xs text-slate-500">
                Guaranteed contract commitments across all 30 clubs (excluding voided deals)
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {spendingLeaderboard.map((row, idx) => (
                <div
                  key={row.team.abbr}
                  className="px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-xs font-black text-slate-400">#{idx + 1}</span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-black text-white"
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
                      ({row.signingsCount} {row.signingsCount === 1 ? 'deal' : 'deals'})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur grid grid-cols-4 py-2">
        {[
          { id: 'feed', label: 'Feed', icon: Flame },
          { id: 'freeAgents', label: 'Free Agents', icon: Users },
          { id: 'teamHub', label: 'Teams', icon: ArrowLeftRight },
          { id: 'leaderboard', label: 'Spending', icon: Trophy },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 text-[11px] font-bold ${
                active ? 'text-sky-500' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

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
              <option value="REPORTED">REPORTED (Sources Say)</option>
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
                placeholder="New Team (e.g., NYY)"
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
