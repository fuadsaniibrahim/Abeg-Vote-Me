import { describe, expect, it } from 'vitest';
import { formatGameDate, gameDateAt, realMsForGameYears, realTimeOfGameMonth, type CalendarConfig } from '../src/calendar.js';

const DAY = 86_400_000;
const cfg: CalendarConfig = { realMsPerGameMonth: DAY, startGameYear: 2027, startGameMonth: 1 };
const epoch = Date.UTC(2026, 9, 6);

describe('calendar', () => {
  it('starts on day 1 of the start month', () => {
    expect(gameDateAt(cfg, epoch, epoch)).toEqual({ year: 2027, month: 1, day: 1, monthsElapsed: 0 });
  });

  it('advances one game month per real day by default', () => {
    expect(gameDateAt(cfg, epoch, epoch + DAY)).toMatchObject({ year: 2027, month: 2, day: 1 });
    expect(gameDateAt(cfg, epoch, epoch + DAY / 2)).toMatchObject({ month: 1, day: 16 });
  });

  it('rolls over years: 12 real days is one game year', () => {
    expect(gameDateAt(cfg, epoch, epoch + 12 * DAY)).toMatchObject({ year: 2028, month: 1, monthsElapsed: 12 });
    expect(gameDateAt(cfg, epoch, epoch + 14 * DAY)).toMatchObject({ year: 2028, month: 3 });
  });

  it('a 4-year term takes 48 real days by default', () => {
    expect(realMsForGameYears(cfg, 4)).toBe(48 * DAY);
  });

  it('respects a different configured rate and start month', () => {
    const fast: CalendarConfig = { realMsPerGameMonth: 3_600_000, startGameYear: 2030, startGameMonth: 11 };
    expect(gameDateAt(fast, epoch, epoch + 3 * 3_600_000)).toMatchObject({ year: 2031, month: 2 });
  });

  it('converts a game month back to its real start time', () => {
    const t = realTimeOfGameMonth(cfg, epoch, 2028, 3);
    expect(t).toBe(epoch + 14 * DAY);
    expect(gameDateAt(cfg, epoch, t)).toMatchObject({ year: 2028, month: 3, day: 1 });
  });

  it('clamps times before the epoch and formats dates', () => {
    expect(gameDateAt(cfg, epoch, epoch - DAY)).toMatchObject({ year: 2027, month: 1, day: 1 });
    expect(formatGameDate({ year: 2027, month: 3, day: 9, monthsElapsed: 2 })).toBe('9 March 2027');
  });
});
