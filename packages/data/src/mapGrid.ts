// Stylised tile map of Nigeria: one square per state on a grid, placed roughly where the state lies
// (north at the top, west on the left). It is a cartogram, not a geographic map: shapes and sizes are not real.

export interface GridCell {
  col: number;
  row: number;
}

export const STATE_GRID: Record<string, GridCell> = {
  // far north
  SO: { col: 1, row: 0 }, ZA: { col: 2, row: 0 }, KT: { col: 3, row: 0 }, KN: { col: 4, row: 0 }, JI: { col: 5, row: 0 }, YO: { col: 6, row: 0 }, BO: { col: 7, row: 0 },
  // north
  KE: { col: 1, row: 1 }, NI: { col: 2, row: 1 }, KD: { col: 3, row: 1 }, BA: { col: 4, row: 1 }, GO: { col: 5, row: 1 }, AD: { col: 6, row: 1 },
  // middle belt
  KW: { col: 1, row: 2 }, FC: { col: 2, row: 2 }, NA: { col: 3, row: 2 }, PL: { col: 4, row: 2 }, TA: { col: 5, row: 2 },
  // south-west and lower middle belt
  OY: { col: 0, row: 3 }, OS: { col: 1, row: 3 }, EK: { col: 2, row: 3 }, KO: { col: 3, row: 3 }, BE: { col: 4, row: 3 },
  // south
  OG: { col: 0, row: 4 }, ON: { col: 1, row: 4 }, ED: { col: 2, row: 4 }, EN: { col: 3, row: 4 }, EB: { col: 4, row: 4 }, CR: { col: 5, row: 4 },
  LA: { col: 0, row: 5 }, DE: { col: 1, row: 5 }, AN: { col: 2, row: 5 }, IM: { col: 3, row: 5 }, AB: { col: 4, row: 5 }, AK: { col: 5, row: 5 },
  // coast
  BY: { col: 2, row: 6 }, RI: { col: 3, row: 6 },
};
