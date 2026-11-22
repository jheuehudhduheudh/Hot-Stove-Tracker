export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const playerId = req.query?.id;
  if (!playerId || !/^\d+$/.test(String(playerId))) {
    return res.status(400).json({ error: 'Valid numeric MLB player id is required' });
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
        team: sp.team?.abbreviation || sp.team?.name || (sp.numTeams ? `${sp.numTeams} TM` : 'MLB'),
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
