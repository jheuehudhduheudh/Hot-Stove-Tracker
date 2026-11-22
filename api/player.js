const MLB_TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

async function handleSearch(q, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const trimmed = String(q || '').trim();
  if (trimmed.length < 2) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(trimmed)}&hydrate=currentTeam`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: `MLB search API returned ${r.status}` });
    }
    const data = await r.json();
    const people = data?.people || [];

    const results = people
      .map((p) => ({
        id: p.id,
        fullName: p.fullName || 'Unknown',
        position: p.primaryPosition?.abbreviation || 'MLB',
        age: p.currentAge || null,
        active: Boolean(p.active),
        mlbDebutDate: p.mlbDebutDate || '',
        teamAbbr: MLB_TEAM_ID_TO_ABBR[p.currentTeam?.id] || null,
        teamName: p.currentTeam?.name || (p.active ? 'Free Agent / MiLB' : 'Retired / Historical'),
      }))
      .sort((a, b) => {
        // Active MLB players first, then players with an MLB debut, then newest debut
        const aMlb = a.active && a.teamAbbr ? 3 : a.active ? 2 : a.mlbDebutDate ? 1 : 0;
        const bMlb = b.active && b.teamAbbr ? 3 : b.active ? 2 : b.mlbDebutDate ? 1 : 0;
        if (bMlb !== aMlb) return bMlb - aMlb;
        return (b.mlbDebutDate || '').localeCompare(a.mlbDebutDate || '');
      })
      .slice(0, 12);

    return res.status(200).json({ query: trimmed, results });
  } catch (err) {
    return res.status(500).json({ error: `Player search failed: ${err.message}` });
  }
}

export default async function handler(req, res) {
  if (req.query?.q) {
    return handleSearch(req.query.q, res);
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const playerId = req.query?.id;
  if (!playerId || !/^\d+$/.test(String(playerId))) {
    return res.status(400).json({ error: 'Valid numeric MLB player id or search query q is required' });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=stats(group=[hitting,pitching],type=[yearByYear,career])`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: `MLB API returned ${r.status}` });
    }

    const data = await r.json();
    const person = data?.people?.[0];
    if (!person) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const posAbbr = person.primaryPosition?.abbreviation || 'MLB';
    const isPitcher =
      person.primaryPosition?.type === 'Pitcher' ||
      ['P', 'SP', 'RP', 'RHP', 'LHP'].includes(posAbbr);
    const primaryGroup = isPitcher ? 'pitching' : 'hitting';

    const stats = person.stats || [];
    const ybyBlock = stats.find(
      (s) =>
        (s?.group?.displayName || '').toLowerCase() === primaryGroup &&
        (s?.type?.displayName || '').toLowerCase() === 'yearbyyear'
    );
    const careerBlock = stats.find(
      (s) =>
        (s?.group?.displayName || '').toLowerCase() === primaryGroup &&
        (s?.type?.displayName || '').toLowerCase() === 'career'
    );

    const seasons = (ybyBlock?.splits || [])
      .filter((sp) => sp.season && sp.stat)
      .map((sp) => ({
        season: sp.season,
        team:
          MLB_TEAM_ID_TO_ABBR[sp.team?.id] ||
          sp.team?.abbreviation ||
          (sp.numTeams ? `${sp.numTeams} TM` : sp.team?.name?.slice(0, 3).toUpperCase() || 'MLB'),
        stat: sp.stat,
      }))
      .reverse();

    const career = careerBlock?.splits?.[0]?.stat || null;

    return res.status(200).json({
      id: person.id,
      fullName: person.fullName,
      position: posAbbr,
      isPitcher,
      age: person.currentAge || '—',
      bats: person.batSide?.code || '—',
      throws: person.pitchHand?.code || '—',
      height: person.height || '',
      weight: person.weight || '',
      mlbDebutDate: person.mlbDebutDate || '',
      seasons,
      career,
      links: {
        mlb: `https://www.mlb.com/player/${person.id}`,
        savant: `https://baseballsavant.mlb.com/savant-player/${person.id}`,
        bref: `https://www.baseball-reference.com/search/search.fcgi?search=${encodeURIComponent(person.fullName)}`,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch player stats: ${err.message}` });
  }
}
