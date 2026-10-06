import { NEWS_POOLS, NEWS_TEMPLATES } from '@avm/data';
import { Rng, renderTemplate } from '@avm/engine';
import type { Queryable } from '../db/index.js';
import { freshRng } from './core.js';

export interface NewsInput {
  kind: string;
  vars: Record<string, string | number>;
  source: 'world' | 'player' | 'story';
  stateCode?: string | null;
  actorId?: string | null;
  body?: string;
  gameTurn?: number | null;
}

/** Naija Daily headline from a template for `kind`. Seeded rng optional (deterministic in ticks/tests). */
export function headlineFor(kind: string, vars: Record<string, string | number>, rng: Rng = freshRng()): string {
  const templates = NEWS_TEMPLATES[kind];
  if (!templates?.length) throw new Error(`No news templates for "${kind}"`);
  return renderTemplate(rng.pick(templates), vars, rng, NEWS_POOLS);
}

export async function publishNews(db: Queryable, n: NewsInput, rng?: Rng): Promise<number> {
  const headline = headlineFor(n.kind, n.vars, rng);
  const r = await db.query<{ id: number }>(
    'INSERT INTO news_items (kind, headline, body, state_code, actor_character_id, source, game_turn) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [n.kind, headline, n.body ?? '', n.stateCode ?? null, n.actorId ?? null, n.source, n.gameTurn ?? null],
  );
  return (r.rows[0] as { id: number }).id;
}
