// Verified 30-Team MLB Roster Payroll & Luxury Tax (CBT) Data ($ Millions)
// Sources:
//  - 2027: FanGraphs RosterResource Payroll Breakdown (Nov 21, 2026 projection)
//  - 2026: Sports Illustrated / Spotrac 2026 MLB Team Payrolls
//  - 2025: Associated Press / MLB Commissioner's Office Final 40-Man Payrolls
//  - 2024: Associated Press / MLB Commissioner's Office Final 40-Man & Luxury Tax Payrolls

export const PAYROLL_YEARS = ['2027', '2026', '2025', '2024'];

export const CBT_THRESHOLDS = {
  '2027': 244, // 2026 CBA baseline ($244M); 2027 threshold subject to new CBA
  '2026': 244,
  '2025': 241,
  '2024': 237,
};

export const PAYROLL_SOURCES = {
  '2027': '2027 Projected Roster Payroll & Luxury Tax (FanGraphs RosterResource, Nov 2026) + live tracked 2026–27 deals',
  '2026': '2026 MLB Team Roster Payrolls (Spotrac / SI; 2026 CBT Threshold: $244M)',
  '2025': '2025 Official Final 40-Man Payrolls (AP / MLB Commissioner’s Office; CBT Threshold: $241M)',
  '2024': '2024 Official Final 40-Man & Luxury Tax Payrolls (AP / MLB Commissioner’s Office; CBT Threshold: $237M)',
};

export const TEAM_PAYROLLS = {
  '2027': {
    LAD: { payroll: 454.0, cbt: 391.0, guarPct: 93.7, arbPct: 3.8,  preArbPct: 2.5,  y2028: 257, y2029: 200, y2030: 154 },
    NYM: { payroll: 298.0, cbt: 298.0, guarPct: 90.4, arbPct: 5.7,  preArbPct: 3.9,  y2028: 161, y2029: 112, y2030: 92 },
    NYY: { payroll: 296.0, cbt: 315.0, guarPct: 84.7, arbPct: 10.7, preArbPct: 4.5,  y2028: 180, y2029: 97,  y2030: 97 },
    PHI: { payroll: 266.0, cbt: 290.0, guarPct: 82.3, arbPct: 12.9, preArbPct: 4.8,  y2028: 164, y2029: 150, y2030: 151 },
    TOR: { payroll: 251.0, cbt: 237.0, guarPct: 83.1, arbPct: 10.9, preArbPct: 6.0,  y2028: 189, y2029: 136, y2030: 88 },
    BOS: { payroll: 227.0, cbt: 268.0, guarPct: 75.8, arbPct: 22.0, preArbPct: 2.2,  y2028: 125, y2029: 125, y2030: 118 },
    ATL: { payroll: 226.0, cbt: 226.0, guarPct: 89.4, arbPct: 4.5,  preArbPct: 6.0,  y2028: 122, y2029: 72,  y2030: 34 },
    HOU: { payroll: 224.0, cbt: 221.0, guarPct: 78.0, arbPct: 15.8, preArbPct: 6.1,  y2028: 79,  y2029: 13,  y2030: 0 },
    SD:  { payroll: 206.0, cbt: 214.0, guarPct: 84.7, arbPct: 8.6,  preArbPct: 6.7,  y2028: 130, y2029: 125, y2030: 136 },
    SF:  { payroll: 188.0, cbt: 189.0, guarPct: 84.1, arbPct: 6.1,  preArbPct: 9.7,  y2028: 137, y2029: 109, y2030: 87 },
    TEX: { payroll: 176.0, cbt: 198.0, guarPct: 69.6, arbPct: 21.7, preArbPct: 8.7,  y2028: 54,  y2029: 52,  y2030: 52 },
    DET: { payroll: 169.0, cbt: 196.0, guarPct: 70.0, arbPct: 22.9, preArbPct: 7.2,  y2028: 24,  y2029: 36,  y2030: 33 },
    ARI: { payroll: 167.0, cbt: 196.0, guarPct: 79.5, arbPct: 10.5, preArbPct: 10.0, y2028: 104, y2029: 117, y2030: 104 },
    CHC: { payroll: 155.0, cbt: 174.0, guarPct: 71.6, arbPct: 19.3, preArbPct: 9.1,  y2028: 100, y2029: 95,  y2030: 79 },
    MIN: { payroll: 151.0, cbt: 176.0, guarPct: 69.3, arbPct: 18.4, preArbPct: 12.3, y2028: 35,  y2029: 5,   y2030: 0 },
    SEA: { payroll: 143.0, cbt: 175.0, guarPct: 56.5, arbPct: 35.0, preArbPct: 8.5,  y2028: 86,  y2029: 92,  y2030: 82 },
    BAL: { payroll: 127.0, cbt: 166.0, guarPct: 69.1, arbPct: 16.2, preArbPct: 14.8, y2028: 64,  y2029: 77,  y2030: 89 },
    KC:  { payroll: 119.0, cbt: 144.0, guarPct: 72.5, arbPct: 13.8, preArbPct: 13.7, y2028: 35,  y2029: 36,  y2030: 36 },
    MIL: { payroll: 119.0, cbt: 140.0, guarPct: 53.6, arbPct: 36.2, preArbPct: 10.3, y2028: 44,  y2029: 30,  y2030: 27 },
    LAA: { payroll: 110.0, cbt: 131.0, guarPct: 53.1, arbPct: 31.6, preArbPct: 15.3, y2028: 37,  y2029: 37,  y2030: 37 },
    COL: { payroll: 109.0, cbt: 129.0, guarPct: 66.9, arbPct: 15.7, preArbPct: 17.4, y2028: 47,  y2029: 14,  y2030: 16 },
    TB:  { payroll: 103.0, cbt: 120.0, guarPct: 36.7, arbPct: 47.5, preArbPct: 15.8, y2028: 0,   y2029: 0,   y2030: 0 },
    PIT: { payroll: 103.0, cbt: 129.0, guarPct: 59.4, arbPct: 27.3, preArbPct: 13.3, y2028: 41,  y2029: 23,  y2030: 29 },
    CLE: { payroll: 102.0, cbt: 118.0, guarPct: 34.1, arbPct: 49.1, preArbPct: 16.8, y2028: 36,  y2029: 47,  y2030: 26 },
    CWS: { payroll: 96.0,  cbt: 118.0, guarPct: 68.2, arbPct: 11.6, preArbPct: 20.2, y2028: 20,  y2029: 18,  y2030: 0 },
    CIN: { payroll: 91.0,  cbt: 117.0, guarPct: 34.8, arbPct: 48.8, preArbPct: 16.5, y2028: 34,  y2029: 23,  y2030: 21 },
    ATH: { payroll: 87.0,  cbt: 122.0, guarPct: 59.0, arbPct: 17.8, preArbPct: 23.2, y2028: 39,  y2029: 51,  y2030: 43 },
    STL: { payroll: 74.0,  cbt: 114.0, guarPct: 4.6,  arbPct: 62.2, preArbPct: 33.3, y2028: 4,   y2029: 8,   y2030: 13 },
    MIA: { payroll: 70.0,  cbt: 91.0,  guarPct: 31.2, arbPct: 41.5, preArbPct: 27.3, y2028: 0,   y2029: 0,   y2030: 0 },
    WSH: { payroll: 54.0,  cbt: 84.0,  guarPct: 25.7, arbPct: 29.7, preArbPct: 44.6, y2028: 22,  y2029: 27,  y2030: 38 },
  },
  '2026': {
    LAD: { payroll: 395.8 }, NYM: { payroll: 367.9 }, NYY: { payroll: 325.4 }, PHI: { payroll: 309.5 }, TOR: { payroll: 302.4 },
    SD:  { payroll: 262.2 }, BOS: { payroll: 256.3 }, DET: { payroll: 236.6 }, ATL: { payroll: 233.0 }, HOU: { payroll: 228.1 },
    CHC: { payroll: 222.4 }, SF:  { payroll: 221.6 }, TEX: { payroll: 199.4 }, BAL: { payroll: 198.2 }, LAA: { payroll: 187.0 },
    SEA: { payroll: 182.6 }, KC:  { payroll: 181.9 }, ARI: { payroll: 162.0 }, CIN: { payroll: 139.0 }, ATH: { payroll: 137.0 },
    MIL: { payroll: 129.1 }, PIT: { payroll: 120.7 }, STL: { payroll: 119.7 }, WSH: { payroll: 106.3 }, CWS: { payroll: 105.5 },
    COL: { payroll: 105.3 }, MIN: { payroll: 101.6 }, TB:  { payroll: 98.8  }, CLE: { payroll: 97.0  }, MIA: { payroll: 77.3  },
  },
  '2025': {
    LAD: { payroll: 345.3 }, NYM: { payroll: 342.1 }, NYY: { payroll: 301.5 }, PHI: { payroll: 291.9 }, TOR: { payroll: 253.1 },
    HOU: { payroll: 236.4 }, TEX: { payroll: 229.9 }, ATL: { payroll: 218.6 }, SD:  { payroll: 217.6 }, CHC: { payroll: 212.0 },
    LAA: { payroll: 207.4 }, BOS: { payroll: 198.2 }, ARI: { payroll: 185.1 }, SF:  { payroll: 182.9 }, SEA: { payroll: 167.3 },
    BAL: { payroll: 165.6 }, DET: { payroll: 162.9 }, KC:  { payroll: 141.5 }, STL: { payroll: 139.1 }, MIN: { payroll: 129.0 },
    COL: { payroll: 128.7 }, MIL: { payroll: 124.9 }, CIN: { payroll: 121.4 }, WSH: { payroll: 107.7 }, CLE: { payroll: 104.2 },
    CWS: { payroll: 87.8  }, PIT: { payroll: 87.2  }, ATH: { payroll: 81.0  }, TB:  { payroll: 80.8  }, MIA: { payroll: 68.7  },
  },
  '2024': {
    NYM: { payroll: 333.3, cbt: 347.7 }, NYY: { payroll: 310.9, cbt: 316.2 }, LAD: { payroll: 270.8, cbt: 353.0 },
    PHI: { payroll: 249.1, cbt: 264.3 }, HOU: { payroll: 244.9, cbt: 264.8 }, TEX: { payroll: 240.8, cbt: 268.4 },
    ATL: { payroll: 234.0, cbt: 276.1 }, CHC: { payroll: 229.7, cbt: 239.9 }, TOR: { payroll: 218.4, cbt: 233.9 },
    SF:  { payroll: 210.9, cbt: 249.1 }, BOS: { payroll: 188.2, cbt: 226.1 }, LAA: { payroll: 179.0, cbt: 190.0 },
    STL: { payroll: 178.3, cbt: 207.7 }, ARI: { payroll: 177.1, cbt: 223.7 }, SD:  { payroll: 172.0, cbt: 227.8 },
    CWS: { payroll: 153.9, cbt: 134.6 }, COL: { payroll: 151.3, cbt: 171.0 }, SEA: { payroll: 145.4, cbt: 167.8 },
    MIN: { payroll: 132.5, cbt: 160.2 }, WSH: { payroll: 130.3, cbt: 140.6 }, KC:  { payroll: 121.8, cbt: 165.1 },
    MIL: { payroll: 120.3, cbt: 162.8 }, CLE: { payroll: 109.5, cbt: 143.9 }, CIN: { payroll: 107.0, cbt: 123.1 },
    BAL: { payroll: 105.4, cbt: 126.8 }, DET: { payroll: 101.0, cbt: 109.5 }, MIA: { payroll: 98.1,  cbt: 121.7 },
    TB:  { payroll: 90.3,  cbt: 106.6 }, PIT: { payroll: 87.3,  cbt: 122.9 }, ATH: { payroll: 66.5,  cbt: 83.9  },
  },
};

export function getTeamPayrollHistory(abbr) {
  return PAYROLL_YEARS.map((year) => ({
    year,
    ...(TEAM_PAYROLLS[year]?.[abbr] || { payroll: 0 }),
  }));
}
