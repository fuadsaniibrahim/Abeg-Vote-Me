// Fictional political parties. Any resemblance to real parties is coincidental satire.
import type { Zone } from './states.js';

export interface PartyData {
  code: string;
  name: string;
  slogan: string;
  /** Hex colour used on maps and tallies. */
  color: string;
  /** Baseline appeal per zone, 0-100. Fed into world generation as a starting leaning. */
  zoneStrength: Record<Zone, number>;
  ideology: 'centre-right' | 'centre-left' | 'populist' | 'labour' | 'none';
  isIndependent?: boolean;
}

export const PARTIES: PartyData[] = [
  {
    code: 'PUP',
    name: 'Progressive Unity Party',
    slogan: 'Una go see am!',
    color: '#1f8a4c',
    ideology: 'centre-right',
    zoneStrength: { NC: 55, NE: 60, NW: 62, SE: 25, SS: 35, SW: 58 },
  },
  {
    code: 'NDA',
    name: 'National Democratic Alliance',
    slogan: 'Power to the people, small small.',
    color: '#c0392b',
    ideology: 'centre-left',
    zoneStrength: { NC: 50, NE: 48, NW: 45, SE: 45, SS: 60, SW: 40 },
  },
  {
    code: 'PRM',
    name: "People's Renewal Movement",
    slogan: 'New broom, clean sweep.',
    color: '#2563eb',
    ideology: 'populist',
    zoneStrength: { NC: 40, NE: 30, NW: 38, SE: 62, SS: 45, SW: 42 },
  },
  {
    code: 'LF',
    name: 'Labour Front',
    slogan: 'Workers first, abeg.',
    color: '#d97706',
    ideology: 'labour',
    zoneStrength: { NC: 35, NE: 22, NW: 25, SE: 50, SS: 40, SW: 38 },
  },
  {
    code: 'IND',
    name: 'Independent',
    slogan: 'No godfather, no wahala.',
    color: '#6b7280',
    ideology: 'none',
    isIndependent: true,
    zoneStrength: { NC: 10, NE: 10, NW: 10, SE: 10, SS: 10, SW: 10 },
  },
];
