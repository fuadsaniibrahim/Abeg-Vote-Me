// Naira formatting and balance operations. Money is always whole naira (integers).

const grouped = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** ₦1,500,000 (negative: -₦1,500,000). */
export function formatNaira(amount: number): string {
  const n = Math.round(amount);
  return `${n < 0 ? '-' : ''}₦${grouped.format(Math.abs(n))}`;
}

/** ₦950, ₦12.5k, ₦1.5m, ₦2.3bn, ₦1.2tn (one decimal, trailing .0 dropped). */
export function formatNairaCompact(amount: number): string {
  const n = Math.round(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const units: [number, string][] = [
    [1e12, 'tn'],
    [1e9, 'bn'],
    [1e6, 'm'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const v = Math.floor((abs / size) * 10) / 10;
      return `${sign}₦${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}${suffix}`;
    }
  }
  return `${sign}₦${abs}`;
}

export type Account = 'wallet' | 'warChest';
export interface Balances {
  wallet: number;
  warChest: number;
}

export class MoneyError extends Error {
  constructor(
    readonly code: 'insufficient_funds' | 'invalid_amount',
    message: string,
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

function checkAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new MoneyError('invalid_amount', `Amount must be a positive whole number, got ${amount}`);
}

export function credit(b: Balances, account: Account, amount: number): Balances {
  checkAmount(amount);
  return { ...b, [account]: b[account] + amount };
}

export function debit(b: Balances, account: Account, amount: number): Balances {
  checkAmount(amount);
  if (b[account] < amount) throw new MoneyError('insufficient_funds', `Not enough money in ${account === 'wallet' ? 'wallet' : 'war chest'}.`);
  return { ...b, [account]: b[account] - amount };
}

export interface TransferResult {
  balances: Balances;
  /** Flags raised by the move, e.g. using campaign funds for personal spending. */
  flags: string[];
}

/** Move money between personal wallet and campaign war chest. War chest → wallet is allowed but flagged. */
export function transfer(b: Balances, from: Account, to: Account, amount: number): TransferResult {
  if (from === to) throw new MoneyError('invalid_amount', 'Source and destination are the same.');
  const balances = credit(debit(b, from, amount), to, amount);
  return { balances, flags: from === 'warChest' ? ['campaign_funds_diverted'] : [] };
}
