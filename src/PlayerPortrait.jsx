import React, { useState, useEffect } from 'react';
import { getTeamInfo } from '../data/mlbData';
import { resolveActiveTeamAbbr, getPlayerInitials } from '../lib/pinnedPlayers';

const SIZE_CLASSES = {
  xs: { box: 'w-8 h-8', text: 'text-[10px]' },
  sm: { box: 'w-10 h-10', text: 'text-xs' },
  md: { box: 'w-12 h-12', text: 'text-sm' },
  lg: { box: 'w-16 h-16', text: 'text-base' },
  xl: { box: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-xl' },
};

/**
 * Stable fixed-dimension player portrait with a clean head-silhouette + initials fallback.
 * Never shows broken-image icons or shifts layout if a headshot is missing or fails to load.
 * Omits team accent colors when a team is discontinued or unavailable.
 */
export default function PlayerPortrait({
  playerId,
  playerName,
  teamAbbr = null,
  size = 'md',
  rounded = 'full',
  className = '',
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [playerId]);

  const activeAbbr = resolveActiveTeamAbbr(teamAbbr);
  const team = activeAbbr ? getTeamInfo(activeAbbr) : null;
  const initials = getPlayerInitials(playerName);
  const dims = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const radiusClass = rounded === 'lg' ? 'rounded-lg' : 'rounded-full';
  const spotSize = size === 'lg' || size === 'xl' ? 180 : 120;
  const hasValidId = Boolean(playerId && Number.isFinite(Number(playerId)) && Number(playerId) > 0);

  return (
    <div
      className={`${dims.box} ${radiusClass} relative flex items-center justify-center font-bold shrink-0 overflow-hidden select-none bg-slate-200 dark:bg-slate-800 ${
        team ? '' : 'border-2 border-slate-300 dark:border-slate-700'
      } ${className}`}
      style={team ? { border: `2.5px solid ${team.color}` } : undefined}
    >
      {hasValidId && !imgFailed ? (
        <img
          src={`https://midfield.mlbstatic.com/v1/people/${playerId}/spots/${spotSize}`}
          alt={playerName || 'MLB Player'}
          loading="lazy"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth === 0) setImgFailed(true);
          }}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover block"
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-200">
          {/* Basic Head-and-Shoulders Silhouette */}
          <svg
            viewBox="0 0 40 40"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full text-slate-400/35 dark:text-slate-600/45"
            fill="currentColor"
          >
            <circle cx="20" cy="14.5" r="7" />
            <path d="M7.5 36.5C8.5 29.5 13.5 25 20 25s11.5 4.5 12.5 11.5H7.5z" />
          </svg>
          <span className={`relative z-10 font-extrabold tracking-tight drop-shadow-sm ${dims.text}`}>
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}
