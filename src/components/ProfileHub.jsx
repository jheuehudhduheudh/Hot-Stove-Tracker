import React, { useState, useMemo } from 'react';
import { ArrowLeft, Pin, Search, User, X, Star, Trash2, Check } from 'lucide-react';
import PlayerPortrait from './PlayerPortrait';
import { MLB_TEAMS, getTeamInfo } from '../data/mlbData';
import {
  resolveActiveTeamAbbr,
  getProfileDisplayName,
} from '../lib/pinnedPlayers';

export default function ProfileHub({
  profile,
  pinnedPlayers,
  savedMyTeams = [],
  onUpdateMyTeams,
  onUnpinPlayer,
  onClearAllPins,
  onOpenPlayer,
  onOpenSearch,
  onOpenTeamHub,
  onBack,
  TeamLogo,
  getTeamBadgeStyle,
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingTeams, setEditingTeams] = useState(false);

  const toggleStarredTeam = (abbr) => {
    if (!onUpdateMyTeams) return;
    const next = savedMyTeams.includes(abbr)
      ? savedMyTeams.filter((t) => t !== abbr)
      : [...savedMyTeams, abbr];
    onUpdateMyTeams(next);
  };

  const isSignedIn = profile?.mode === 'authenticated' && Boolean(profile?.username);
  const displayName = getProfileDisplayName(profile);

  const filteredPins = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return pinnedPlayers;
    return pinnedPlayers.filter((p) => {
      const activeAbbr = resolveActiveTeamAbbr(p.teamAbbr);
      const teamName = activeAbbr ? getTeamInfo(activeAbbr).name : '';
      const hay = `${p.fullName} ${p.position || ''} ${activeAbbr || ''} ${teamName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pinnedPlayers, filterQuery]);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
        >
          <ArrowLeft className="w-4 h-4 text-sky-500" />
          <span>Back to Tracker</span>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Find Players to Pin</span>
        </button>
      </div>

      {/* Profile Identity Header (Guest now, Username later) */}
      <section className="p-5 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-sky-500" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight truncate">
                  {isSignedIn ? `@${displayName}` : displayName}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isSignedIn
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isSignedIn ? 'Account' : 'Local Browser'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isSignedIn
                  ? 'Signed in — your pinned favorite players are linked to your profile.'
                  : 'Browsing as Guest — your pinned players are saved locally in this browser for now, just like your starred teams.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-center min-w-[92px]">
              <div className="font-stat text-lg font-black text-sky-500 leading-tight">
                {pinnedPlayers.length}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                Pinned
              </div>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-center min-w-[92px]">
              <div className="font-stat text-lg font-black leading-tight">
                {savedMyTeams.length}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                My Teams
              </div>
            </div>
          </div>
        </div>

        {/* Saved Starred Teams Quick Strip + Inline Editor */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mr-1">
                <Star className="w-3 h-3 text-amber-400 fill-current" />
                My Teams ({savedMyTeams.length}):
              </span>
              {savedMyTeams.length === 0 ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  None selected yet
                </span>
              ) : (
                savedMyTeams.map((abbr) => {
                  const activeAbbr = resolveActiveTeamAbbr(abbr);
                  if (!activeAbbr) return null;
                  const tInfo = getTeamInfo(activeAbbr);
                  return (
                    <span
                      key={activeAbbr}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenTeamHub && onOpenTeamHub(activeAbbr)}
                        className="inline-flex items-center gap-1.5 hover:text-sky-500 transition"
                      >
                        {TeamLogo && <TeamLogo abbr={activeAbbr} size="xs" className="!w-4 !h-4" />}
                        <span>{tInfo.short}</span>
                      </button>
                      {onUpdateMyTeams && (
                        <button
                          type="button"
                          onClick={() => toggleStarredTeam(activeAbbr)}
                          title={`Remove ${tInfo.short} from My Teams`}
                          aria-label={`Remove ${tInfo.short} from My Teams`}
                          className="ml-0.5 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  );
                })
              )}
            </div>

            {onUpdateMyTeams && (
              <button
                type="button"
                onClick={() => setEditingTeams((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-sky-500 transition shrink-0"
              >
                {editingTeams ? <Check className="w-3 h-3 text-emerald-500" /> : <Star className="w-3 h-3 text-amber-400" />}
                <span>{editingTeams ? 'Done' : 'Edit My Teams'}</span>
              </button>
            )}
          </div>

          {editingTeams && onUpdateMyTeams && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-500 dark:text-slate-400">
                  Click teams to add or remove (saves automatically in this browser):
                </span>
                {savedMyTeams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateMyTeams([])}
                    className="font-bold text-rose-500 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-1.5">
                {MLB_TEAMS.map((t) => {
                  const active = savedMyTeams.includes(t.abbr);
                  return (
                    <button
                      key={t.abbr}
                      type="button"
                      onClick={() => toggleStarredTeam(t.abbr)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition ${
                        active
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400'
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
      </section>

      {/* Pinned Favorite Players List */}
      <section className="p-5 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
              <Pin className="w-4 h-4 text-sky-500" />
              <span>Pinned Favorite Players ({pinnedPlayers.length})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pin active, retired, older, or historical MLB players from Search or the Live Feed. Click any player to open their full stats page.
            </p>
          </div>

          {pinnedPlayers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter pinned players..."
                  className="pl-8 pr-7 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterQuery('')}
                    aria-label="Clear filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {confirmClear ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllPins();
                      setConfirmClear(false);
                      setFilterQuery('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-500/40 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          )}
        </div>

        {pinnedPlayers.length === 0 ? (
          <div className="py-14 px-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-center space-y-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
              <Pin className="w-5 h-5 text-slate-400" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No pinned players yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Search for any active, retired, or historical MLB player—or click Pin on players in the Live Feed—to build your favorites list here.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenSearch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Players</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500 transition"
              >
                Browse Live Feed
              </button>
            </div>
          </div>
        ) : filteredPins.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
            No pinned players match &ldquo;{filterQuery}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPins.map((player) => {
              const activeAbbr = resolveActiveTeamAbbr(player.teamAbbr);
              const teamInfo = activeAbbr ? getTeamInfo(activeAbbr) : null;

              return (
                <div
                  key={player.playerId}
                  onClick={() => onOpenPlayer(player.playerId, player.fullName, activeAbbr || 'MLB')}
                  className="group p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-sky-500/50 cursor-pointer transition flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerPortrait
                      playerId={player.playerId}
                      playerName={player.fullName}
                      teamAbbr={activeAbbr}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate group-hover:text-sky-500 transition-colors">
                        {player.fullName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-stat text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                          {player.position || 'MLB'}
                        </span>
                        {teamInfo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTeamHub && onOpenTeamHub(teamInfo.abbr);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black shadow-sm hover:opacity-85 transition"
                            style={getTeamBadgeStyle ? getTeamBadgeStyle(teamInfo.color) : { backgroundColor: teamInfo.color, color: '#fff' }}
                            title={`Open ${teamInfo.name} Team Hub`}
                          >
                            {TeamLogo && <TeamLogo abbr={teamInfo.abbr} size="xs" className="!w-3 !h-3" />}
                            <span>{teamInfo.abbr}</span>
                          </button>
                        )}
                        {player.active === false && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            Retired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => onUnpinPlayer(player, e)}
                    title={`Unpin ${player.fullName}`}
                    aria-label={`Unpin ${player.fullName}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 shrink-0 transition"
                  >
                    <Pin className="w-3 h-3 fill-current" />
                    <span className="hidden sm:inline">Pinned</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
