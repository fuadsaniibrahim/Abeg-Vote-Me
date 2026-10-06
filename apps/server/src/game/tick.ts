// World tick: one in-game month per tick. Runs every missed month (catch-up after downtime),
// is idempotent (each turn claimed atomically), and is deterministic per (seed, turn).
import { BUSINESS_SECTORS } from '@avm/data';
import {
  INITIAL_ECONOMY,
  Rng,
  averageInsecurity,
  economyFactor,
  formatNaira,
  gameDateAt,
  monthlyBusinessIncome,
  nationalInsecurity,
  tickWorld,
  type EconomyState,
  type InsecurityLevels,
  type UnitProfile,
  type WorldSimState,
} from '@avm/engine';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { credit } from './core.js';
import { publishNews } from './news.js';
import { deliver, notify, type NotificationRow } from './notify.js';
import { stateName } from './characters.js';

interface WorldRow {
  seed: string;
  clock_epoch: Date;
  last_tick_turn: number;
  economy: EconomyState | Record<string, never>;
  metrics: { insecurity?: Record<string, InsecurityLevels>; approval?: number };
}

async function loadSimState(db: Queryable, ws: WorldRow): Promise<WorldSimState> {
  const states = await db.query<{ code: string; profile: UnitProfile }>('SELECT code, profile FROM states ORDER BY code');
  const insecurity: Record<string, InsecurityLevels> = ws.metrics.insecurity ?? Object.fromEntries(states.rows.map((s) => [s.code, s.profile.insecurity]));
  return {
    turn: ws.last_tick_turn,
    economy: 'inflation' in ws.economy ? (ws.economy as EconomyState) : INITIAL_ECONOMY,
    insecurity,
    wealth: Object.fromEntries(states.rows.map((s) => [s.code, s.profile.wealth])),
    approval: ws.metrics.approval ?? 50,
  };
}

export interface TickReport {
  turn: number;
  businessesPaid: number;
  totalIncome: number;
}

/** Run exactly one tick (turn = last_tick_turn + 1). Returns null if another worker already claimed it. */
export async function runOneTick(ctx: AppContext): Promise<TickReport | null> {
  const pending: NotificationRow[] = [];
  const report = await ctx.db.transaction(async (tx) => {
    const r = await tx.query<WorldRow>('SELECT seed, clock_epoch, last_tick_turn, economy, metrics FROM world_state WHERE id = 1 FOR UPDATE');
    const ws = r.rows[0];
    if (!ws) return null;
    const turn = ws.last_tick_turn + 1;
    const sim = await loadSimState(tx, ws);
    const next = tickWorld(sim, { economy: { fuelSubsidy: false, corruption: 50, spending: 0, oilShock: 0 }, security: {} }, ws.seed);
    const claimed = await tx.query(
      'UPDATE world_state SET last_tick_turn = $1, economy = $2::jsonb, metrics = $3::jsonb, updated_at = now() WHERE id = 1 AND last_tick_turn = $4',
      [turn, JSON.stringify(next.economy), JSON.stringify({ insecurity: next.insecurity, approval: next.approval }), ws.last_tick_turn],
    );
    if (!claimed.rowCount) return null;

    // business income
    const rng = new Rng(`${ws.seed}/turn:${turn}/business`);
    const biz = await tx.query<{ id: string; owner_id: string; sector: string; state_code: string; capital: number; intelligence: number }>(
      `SELECT b.id, b.owner_id, b.sector, b.state_code, b.capital, (c.stats->>'intelligence')::int AS intelligence
       FROM businesses b JOIN characters c ON c.id = b.owner_id WHERE b.closed_at IS NULL ORDER BY b.id`,
    );
    const perOwner = new Map<string, number>();
    let total = 0;
    let paid = 0;
    for (const b of biz.rows) {
      const sector = BUSINESS_SECTORS.find((s) => s.id === b.sector);
      if (!sector) continue;
      const levels = next.insecurity[b.state_code];
      const factor = economyFactor(next.economy.inflation, levels ? averageInsecurity(levels) : 30);
      const income = monthlyBusinessIncome(sector, Number(b.capital), factor, b.intelligence, rng.fork(b.id));
      if (income > 0) {
        await credit(tx, b.owner_id, 'wallet', income, 'business_income', { type: 'business', id: b.id });
        perOwner.set(b.owner_id, (perOwner.get(b.owner_id) ?? 0) + income);
        total += income;
        paid++;
      }
    }
    for (const [owner, amount] of perOwner) pending.push(await notify(tx, owner, 'business_income', `Your businesses earned ${formatNaira(amount)} this month`));

    // headlines
    const newsRng = new Rng(`${ws.seed}/turn:${turn}/news`);
    await publishNews(
      tx,
      { kind: 'economy_monthly', vars: { inflation: next.economy.inflation.toFixed(1), fuel: formatNaira(next.economy.fuelPrice), fx: formatNaira(next.economy.exchangeRate) }, source: 'world', gameTurn: turn },
      newsRng,
    );
    let biggest: { code: string; delta: number } | null = null;
    for (const code of Object.keys(next.insecurity)) {
      const delta = averageInsecurity(next.insecurity[code] as InsecurityLevels) - averageInsecurity(sim.insecurity[code] as InsecurityLevels);
      if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { code, delta };
    }
    if (biggest && Math.abs(biggest.delta) >= 1) {
      const kind = 'insecurity_monthly';
      // pick the template matching the direction: 0 = worsens, 1 = improves
      const vars = { state: stateName(biggest.code) };
      const headline = biggest.delta > 0 ? `Security situation worsens in ${vars.state}, residents worried` : `Residents in ${vars.state} report improved security`;
      await tx.query("INSERT INTO news_items (kind, headline, state_code, source, game_turn) VALUES ($1, $2, $3, 'world', $4)", [kind, headline, biggest.code, turn]);
    }
    await tx.query("INSERT INTO audit_log (action, target_type, target_id, details) VALUES ('world.tick', 'world', '1', $1::jsonb)", [
      JSON.stringify({ turn, businessesPaid: paid, totalIncome: total, nationalInsecurity: Math.round(nationalInsecurity(next.insecurity) * 10) / 10 }),
    ]);
    return { turn, businessesPaid: paid, totalIncome: total };
  });
  deliver(ctx.realtime, pending);
  return report;
}

/** Run every tick that is due at `nowMs` (up to maxCatchUpTurns per call). */
export async function runDueTicks(ctx: AppContext, nowMs = Date.now()): Promise<TickReport[]> {
  const r = await ctx.db.query<{ clock_epoch: Date; last_tick_turn: number }>('SELECT clock_epoch, last_tick_turn FROM world_state WHERE id = 1');
  const ws = r.rows[0];
  if (!ws) return [];
  const due = gameDateAt(ctx.game.calendar, new Date(ws.clock_epoch).getTime(), nowMs).monthsElapsed;
  const reports: TickReport[] = [];
  let last = ws.last_tick_turn;
  while (last < due && reports.length < ctx.game.tick.maxCatchUpTurns) {
    const rep = await runOneTick(ctx);
    if (!rep) break;
    reports.push(rep);
    last = rep.turn;
  }
  return reports;
}

/** In-process scheduler. Returns a stop function. (BullMQ is not implemented; see KNOWN_GAPS.md.) */
export function startTickScheduler(ctx: AppContext, log: (msg: string) => void): () => void {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const reps = await runDueTicks(ctx);
      for (const rep of reps) log(`world tick ${rep.turn}: ${rep.businessesPaid} businesses paid ${formatNaira(rep.totalIncome)}`);
    } catch (e) {
      log(`world tick failed: ${String(e)}`);
    } finally {
      running = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), ctx.game.tick.checkIntervalMs);
  return () => clearInterval(timer);
}
