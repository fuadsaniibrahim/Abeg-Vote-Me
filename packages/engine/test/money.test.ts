import { describe, expect, it } from 'vitest';
import { MoneyError, credit, debit, formatNaira, formatNairaCompact, transfer } from '../src/money.js';

describe('formatNaira', () => {
  it('formats with naira sign and thousands separators', () => {
    expect(formatNaira(1_500_000)).toBe('₦1,500,000');
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(999)).toBe('₦999');
    expect(formatNaira(-25_000)).toBe('-₦25,000');
    expect(formatNaira(1234.6)).toBe('₦1,235');
  });

  it('has a compact form', () => {
    expect(formatNairaCompact(950)).toBe('₦950');
    expect(formatNairaCompact(12_500)).toBe('₦12.5k');
    expect(formatNairaCompact(1_500_000)).toBe('₦1.5m');
    expect(formatNairaCompact(2_000_000)).toBe('₦2m');
    expect(formatNairaCompact(2_340_000_000)).toBe('₦2.3bn');
    expect(formatNairaCompact(1_200_000_000_000)).toBe('₦1.2tn');
    expect(formatNairaCompact(-1_500_000)).toBe('-₦1.5m');
  });
});

describe('balances', () => {
  const b = { wallet: 1000, warChest: 500 };

  it('credits and debits separate accounts without mutating', () => {
    expect(credit(b, 'warChest', 100)).toEqual({ wallet: 1000, warChest: 600 });
    expect(debit(b, 'wallet', 1000)).toEqual({ wallet: 0, warChest: 500 });
    expect(b).toEqual({ wallet: 1000, warChest: 500 });
  });

  it('never allows a negative balance', () => {
    expect(() => debit(b, 'warChest', 501)).toThrow(MoneyError);
    try {
      debit(b, 'warChest', 501);
    } catch (e) {
      expect((e as MoneyError).code).toBe('insufficient_funds');
    }
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amt of [0, -5, 1.5]) expect(() => credit(b, 'wallet', amt)).toThrow(/positive whole number/);
  });

  it('moves wallet to war chest cleanly, and flags war chest to wallet as diverted campaign funds', () => {
    expect(transfer(b, 'wallet', 'warChest', 300)).toEqual({ balances: { wallet: 700, warChest: 800 }, flags: [] });
    expect(transfer(b, 'warChest', 'wallet', 200)).toEqual({ balances: { wallet: 1200, warChest: 300 }, flags: ['campaign_funds_diverted'] });
    expect(() => transfer(b, 'wallet', 'wallet', 1)).toThrow();
  });
});
