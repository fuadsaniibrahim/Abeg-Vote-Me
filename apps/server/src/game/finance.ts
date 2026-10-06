import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BUSINESS_SECTORS } from '@avm/data';
import { BACKGROUNDS, MAX_ACTIVE_BUSINESSES, businessStartCost, getSector, transfer as engineTransfer, type BackgroundId } from '@avm/engine';
import type { AppContext } from '../context.js';
import { audit } from '../audit.js';
import { bad, credit, debit, requireCharacter } from './core.js';
import { publishNews } from './news.js';
import { stateName } from './characters.js';

export function registerFinanceRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/businesses/sectors', async () => ({ sectors: BUSINESS_SECTORS }));

  app.post('/api/businesses', async (req, reply) => {
    const parsed = z
      .object({ name: z.string().trim().min(3).max(60), sector: z.string(), capital: z.number().int().positive() })
      .safeParse(req.body);
    if (!parsed.success) throw bad('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid input');
    const { name, sector: sectorId, capital } = parsed.data;
    const sector = getSector(sectorId);
    if (!sector) throw bad('invalid_sector', 'Unknown business sector.');
    if (capital < sector.minCapital) throw bad('capital_too_low', `A ${sector.label} needs at least ₦${sector.minCapital.toLocaleString('en-NG')} capital.`);
    const out = await ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const n = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM businesses WHERE owner_id = $1 AND closed_at IS NULL', [c.id]);
      if ((n.rows[0]?.n ?? 0) >= MAX_ACTIVE_BUSINESSES) throw bad('too_many_businesses', `You can run at most ${MAX_ACTIVE_BUSINESSES} businesses.`);
      const perks = BACKGROUNDS[c.background as BackgroundId]?.perks.map((p) => p.id) ?? [];
      const cost = businessStartCost(capital, perks);
      const r = await tx.query<{ id: string }>('INSERT INTO businesses (owner_id, name, sector, state_code, capital) VALUES ($1, $2, $3, $4, $5) RETURNING id', [c.id, name, sector.id, c.home_state_code, capital]);
      const id = (r.rows[0] as { id: string }).id;
      await debit(tx, c.id, 'wallet', cost, 'business_start', { type: 'business', id });
      await audit(tx, { action: 'business.start', actorUserId: c.user_id, actorCharacterId: c.id, targetType: 'business', targetId: id, details: { sector: sector.id, capital, cost }, ip: req.ip });
      await publishNews(tx, { kind: 'business_started', vars: { name: c.name, sector: sector.label.toLowerCase(), state: stateName(c.home_state_code) }, source: 'player', stateCode: c.home_state_code, actorId: c.id });
      return { id, cost };
    });
    return reply.code(201).send(out);
  });

  app.get('/api/me/finance', async (req) => {
    const c = await requireCharacter(ctx, req);
    const [tx, biz] = await Promise.all([
      ctx.db.query<{ id: number; account: string; delta: number; reason: string; created_at: Date }>(
        'SELECT id, account, delta, reason, created_at FROM transactions WHERE character_id = $1 ORDER BY id DESC LIMIT 50',
        [c.id],
      ),
      ctx.db.query<{ id: string; name: string; sector: string; state_code: string; capital: number; created_at: Date; earned: number }>(
        `SELECT b.id, b.name, b.sector, b.state_code, b.capital, b.created_at,
           COALESCE((SELECT sum(delta)::bigint FROM transactions t WHERE t.ref_type = 'business' AND t.ref_id = b.id::text AND t.reason = 'business_income'), 0) AS earned
         FROM businesses b WHERE b.owner_id = $1 AND b.closed_at IS NULL ORDER BY b.created_at`,
        [c.id],
      ),
    ]);
    return {
      wallet: Number(c.wallet),
      warChest: Number(c.war_chest),
      transactions: tx.rows.map((t) => ({ id: t.id, account: t.account, delta: Number(t.delta), reason: t.reason, createdAt: t.created_at })),
      businesses: biz.rows.map((b) => ({
        id: b.id,
        name: b.name,
        sector: b.sector,
        sectorLabel: getSector(b.sector)?.label ?? b.sector,
        stateCode: b.state_code,
        capital: Number(b.capital),
        earned: Number(b.earned),
        createdAt: b.created_at,
      })),
    };
  });

  /** Move money between wallet and war chest. War chest → wallet is allowed but audited as diverted campaign funds. */
  app.post('/api/me/transfer', async (req) => {
    const parsed = z.object({ from: z.enum(['wallet', 'warChest']), to: z.enum(['wallet', 'warChest']), amount: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) throw bad('invalid_input', 'Invalid transfer.');
    const { from, to, amount } = parsed.data;
    if (from === to) throw bad('invalid_transfer', 'Pick two different accounts.');
    return ctx.db.transaction(async (tx) => {
      const c = await requireCharacter(ctx, req, tx, true);
      const before = { wallet: Number(c.wallet), warChest: Number(c.war_chest) };
      // the DB debit enforces the balance atomically (throws a clean error if too low)...
      await debit(tx, c.id, from, amount, 'transfer_out');
      await credit(tx, c.id, to, amount, 'transfer_in');
      // ...and the engine decides the flags (balance is known to be sufficient here)
      const { flags } = engineTransfer(before, from, to, amount);
      await audit(tx, { action: 'money.transfer', actorUserId: c.user_id, actorCharacterId: c.id, details: { from, to, amount, flags }, ip: req.ip });
      const r = await tx.query<{ wallet: number; war_chest: number }>('SELECT wallet, war_chest FROM characters WHERE id = $1', [c.id]);
      return { wallet: Number(r.rows[0]?.wallet), warChest: Number(r.rows[0]?.war_chest), flags };
    });
  });
}
