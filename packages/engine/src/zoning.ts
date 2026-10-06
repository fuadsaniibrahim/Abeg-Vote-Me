// Zoning: an informal expectation that a ticket goes to a particular zone this cycle.
import type { Zone } from '@avm/data';
import { clamp } from './rng.js';

export interface ZoningArrangement {
  /** Zone the ticket is "zoned" to. Null = open contest. */
  zonedTo: Zone | null;
  /** 0-1: how seriously the party takes it (1 = binding consensus). */
  strength: number;
  /** Zones that have struck a deal to support the zoned zone (coalitions). */
  alliedZones?: Zone[];
}

/**
 * Multiplier (0.25-1.4) on a candidate's ticket odds (primary delegate support).
 * In the zoned zone: bonus. In an allied zone: smaller penalty. Elsewhere: penalty that grows with strength.
 */
export function zoningModifier(candidateZone: Zone, z: ZoningArrangement): number {
  if (!z.zonedTo) return 1;
  const s = clamp(z.strength, 0, 1);
  if (candidateZone === z.zonedTo) return 1 + 0.4 * s;
  if (z.alliedZones?.includes(candidateZone)) return 1 - 0.3 * s;
  return 1 - 0.75 * s;
}
