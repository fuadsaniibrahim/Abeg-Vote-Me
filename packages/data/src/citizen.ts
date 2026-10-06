// Citizen-level content: business sectors, civic groups, protest issues.

export interface BusinessSector {
  id: string;
  label: string;
  /** Minimum starting capital, naira. */
  minCapital: number;
  /** Expected monthly return as a fraction of capital (before economy and luck). */
  monthlyYield: number;
  /** 0-1: how much luck swings monthly income. */
  volatility: number;
}

export const BUSINESS_SECTORS: BusinessSector[] = [
  { id: 'provisions', label: 'Provisions shop', minCapital: 300_000, monthlyYield: 0.03, volatility: 0.2 },
  { id: 'pos', label: 'POS / mobile money kiosk', minCapital: 200_000, monthlyYield: 0.04, volatility: 0.3 },
  { id: 'transport', label: 'Keke and bus transport', minCapital: 1_500_000, monthlyYield: 0.035, volatility: 0.35 },
  { id: 'farm', label: 'Farm (cassava, maize, poultry)', minCapital: 800_000, monthlyYield: 0.03, volatility: 0.45 },
  { id: 'restaurant', label: 'Buka / restaurant', minCapital: 600_000, monthlyYield: 0.035, volatility: 0.3 },
  { id: 'real_estate', label: 'Real estate', minCapital: 10_000_000, monthlyYield: 0.02, volatility: 0.15 },
  { id: 'filling_station', label: 'Filling station', minCapital: 25_000_000, monthlyYield: 0.025, volatility: 0.3 },
  { id: 'tech', label: 'Tech startup', minCapital: 2_000_000, monthlyYield: 0.045, volatility: 0.6 },
];

export const CIVIC_GROUPS = [
  { kind: 'labour', label: 'Labour union', blurb: 'Solidarity forever. And minimum wage.' },
  { kind: 'student', label: 'Students union', blurb: 'Aluta continua, victoria ascerta!' },
  { kind: 'trade', label: 'Traders association', blurb: 'Market people no dey carry last.' },
  { kind: 'community_watch', label: 'Community watch', blurb: 'We dey look out for our area.' },
] as const;
export type GroupKind = (typeof CIVIC_GROUPS)[number]['kind'];

export const PROTEST_ISSUES = ['fuel_price', 'security', 'jobs', 'power', 'education', 'corruption', 'roads', 'health'] as const;
