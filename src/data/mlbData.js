export const MLB_TEAMS = [
  { id: 108, abbr: 'LAA', name: 'Los Angeles Angels', short: 'Angels', division: 'AL West', color: '#BA0021' },
  { id: 109, abbr: 'ARI', name: 'Arizona Diamondbacks', short: 'Diamondbacks', division: 'NL West', color: '#A71930' },
  { id: 110, abbr: 'BAL', name: 'Baltimore Orioles', short: 'Orioles', division: 'AL East', color: '#DF4601' },
  { id: 111, abbr: 'BOS', name: 'Boston Red Sox', short: 'Red Sox', division: 'AL East', color: '#BD3039' },
  { id: 112, abbr: 'CHC', name: 'Chicago Cubs', short: 'Cubs', division: 'NL Central', color: '#0E3386' },
  { id: 113, abbr: 'CIN', name: 'Cincinnati Reds', short: 'Reds', division: 'NL Central', color: '#C6011F' },
  { id: 114, abbr: 'CLE', name: 'Cleveland Guardians', short: 'Guardians', division: 'AL Central', color: '#E50022' },
  { id: 115, abbr: 'COL', name: 'Colorado Rockies', short: 'Rockies', division: 'NL West', color: '#333366' },
  { id: 116, abbr: 'DET', name: 'Detroit Tigers', short: 'Tigers', division: 'AL Central', color: '#FA4616' },
  { id: 117, abbr: 'HOU', name: 'Houston Astros', short: 'Astros', division: 'AL West', color: '#EB6E1F' },
  { id: 118, abbr: 'KC',  name: 'Kansas City Royals', short: 'Royals', division: 'AL Central', color: '#004687' },
  { id: 119, abbr: 'LAD', name: 'Los Angeles Dodgers', short: 'Dodgers', division: 'NL West', color: '#005A9C' },
  { id: 120, abbr: 'WSH', name: 'Washington Nationals', short: 'Nationals', division: 'NL East', color: '#AB0003' },
  { id: 121, abbr: 'NYM', name: 'New York Mets', short: 'Mets', division: 'NL East', color: '#FF5910' },
  { id: 133, abbr: 'ATH', name: 'Athletics', short: 'Athletics', division: 'AL West', color: '#003831' },
  { id: 134, abbr: 'PIT', name: 'Pittsburgh Pirates', short: 'Pirates', division: 'NL Central', color: '#FDB827' },
  { id: 135, abbr: 'SD',  name: 'San Diego Padres', short: 'Padres', division: 'NL West', color: '#FFC425' },
  { id: 136, abbr: 'SEA', name: 'Seattle Mariners', short: 'Mariners', division: 'AL West', color: '#005C5C' },
  { id: 137, abbr: 'SF',  name: 'San Francisco Giants', short: 'Giants', division: 'NL West', color: '#FD5A1E' },
  { id: 138, abbr: 'STL', name: 'St. Louis Cardinals', short: 'Cardinals', division: 'NL Central', color: '#C41E3A' },
  { id: 139, abbr: 'TB',  name: 'Tampa Bay Rays', short: 'Rays', division: 'AL East', color: '#092C5C' },
  { id: 140, abbr: 'TEX', name: 'Texas Rangers', short: 'Rangers', division: 'AL West', color: '#003278' },
  { id: 141, abbr: 'TOR', name: 'Toronto Blue Jays', short: 'Blue Jays', division: 'AL East', color: '#134A8E' },
  { id: 142, abbr: 'MIN', name: 'Minnesota Twins', short: 'Twins', division: 'AL Central', color: '#002B5C' },
  { id: 143, abbr: 'PHI', name: 'Philadelphia Phillies', short: 'Phillies', division: 'NL East', color: '#E81828' },
  { id: 144, abbr: 'ATL', name: 'Atlanta Braves', short: 'Braves', division: 'NL East', color: '#CE1141' },
  { id: 145, abbr: 'CWS', name: 'Chicago White Sox', short: 'White Sox', division: 'AL Central', color: '#27251F' },
  { id: 146, abbr: 'MIA', name: 'Miami Marlins', short: 'Marlins', division: 'NL East', color: '#00A3E0' },
  { id: 147, abbr: 'NYY', name: 'New York Yankees', short: 'Yankees', division: 'AL East', color: '#003087' },
  { id: 158, abbr: 'MIL', name: 'Milwaukee Brewers', short: 'Brewers', division: 'NL Central', color: '#12284B' },
];

export const DIVISIONS = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West'];

export function getTeamInfo(abbrOrName) {
  if (!abbrOrName) return { abbr: 'MLB', name: 'MLB', short: 'MLB', division: '', color: '#334155' };
  const q = abbrOrName.toLowerCase().trim();
  return (
    MLB_TEAMS.find(
      (t) =>
        t.abbr.toLowerCase() === q ||
        t.name.toLowerCase() === q ||
        t.short.toLowerCase() === q
    ) || { abbr: abbrOrName.slice(0, 3).toUpperCase(), name: abbrOrName, short: abbrOrName, division: '', color: '#334155' }
  );
}
