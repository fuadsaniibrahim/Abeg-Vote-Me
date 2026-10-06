// Real time ↔ in-game time. Default: 1 in-game month = 1 real day.

export interface CalendarConfig {
  realMsPerGameMonth: number;
  startGameYear: number;
  /** 1-12 */
  startGameMonth: number;
}

export interface GameDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-30 (every game month has 30 days for simplicity) */
  day: number;
  /** Whole game months elapsed since the epoch (the "turn"). */
  monthsElapsed: number;
}

export const DAYS_PER_GAME_MONTH = 30;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function gameDateAt(cfg: CalendarConfig, epochMs: number, nowMs: number): GameDate {
  const elapsed = Math.max(0, nowMs - epochMs);
  const monthsFloat = elapsed / cfg.realMsPerGameMonth;
  const monthsElapsed = Math.floor(monthsFloat);
  const absMonth = cfg.startGameYear * 12 + (cfg.startGameMonth - 1) + monthsElapsed;
  const day = Math.min(DAYS_PER_GAME_MONTH, Math.floor((monthsFloat - monthsElapsed) * DAYS_PER_GAME_MONTH) + 1);
  return { year: Math.floor(absMonth / 12), month: (absMonth % 12) + 1, day, monthsElapsed };
}

/** Real timestamp at which the given game month (year, 1-12) begins. */
export function realTimeOfGameMonth(cfg: CalendarConfig, epochMs: number, year: number, month: number): number {
  const months = year * 12 + (month - 1) - (cfg.startGameYear * 12 + (cfg.startGameMonth - 1));
  return epochMs + months * cfg.realMsPerGameMonth;
}

/** Real milliseconds that `gameYears` in-game years take. */
export function realMsForGameYears(cfg: CalendarConfig, gameYears: number): number {
  return gameYears * 12 * cfg.realMsPerGameMonth;
}

export function formatGameDate(d: GameDate): string {
  return `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year}`;
}
