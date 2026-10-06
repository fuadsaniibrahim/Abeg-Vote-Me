import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { baseStats } from '../src/stats.js';
import { applyEffects, availableChoices, checkCondition, isEligible, resolveChoice, selectEvent } from '../src/events/engine.js';
import { validateEvents } from '../src/events/validate.js';
import type { EventContext, EventDef } from '../src/events/types.js';

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  turn: 10,
  stats: baseStats(50),
  money: { wallet: 1_000_000, warChest: 0 },
  approval: 50,
  career: 'citizen',
  phase: 'campaign',
  flags: [],
  metrics: { security: 40 },
  history: {},
  scheduled: [],
  ...over,
});

const ev = (id: string, over: Partial<EventDef> = {}): EventDef => ({
  id,
  category: 'humour',
  title: id,
  text: 'Something happened to {playerName}.',
  weight: 1,
  cooldown: 5,
  conditions: [],
  choices: [{ id: 'ok', label: 'OK', outcomes: [{ weight: 1, text: 'Fine.', effects: [] }] }],
  ...over,
});

describe('conditions', () => {
  it('evaluates stat, metric, money, approval, career, phase and flag conditions', () => {
    const c = ctx({ flags: ['has_godfather'] });
    expect(checkCondition({ stat: 'charisma', op: 'gte', value: 50 }, c)).toBe(true);
    expect(checkCondition({ stat: 'charisma', op: 'gt', value: 50 }, c)).toBe(false);
    expect(checkCondition({ metric: 'security', op: 'lt', value: 50 }, c)).toBe(true);
    expect(checkCondition({ metric: 'missing', op: 'eq', value: 0 }, c)).toBe(true);
    expect(checkCondition({ money: 'wallet', op: 'gte', value: 1_000_001 }, c)).toBe(false);
    expect(checkCondition({ approval: 'lte', value: 50 }, c)).toBe(true);
    expect(checkCondition({ career: ['governor', 'president'] }, c)).toBe(false);
    expect(checkCondition({ phase: ['campaign'] }, c)).toBe(true);
    expect(checkCondition({ flag: 'has_godfather', present: true }, c)).toBe(true);
    expect(checkCondition({ flag: 'jailed', present: false }, c)).toBe(true);
  });
});

describe('selection with cooldown history', () => {
  it('skips events whose conditions fail', () => {
    expect(isEligible(ev('gov', { conditions: [{ career: ['governor'] }] }), ctx())).toBe(false);
  });

  it('does not repeat an event within its cooldown, allows it after', () => {
    const e = ev('x', { cooldown: 5 });
    expect(isEligible(e, ctx({ turn: 10, history: { x: 7 } }))).toBe(false);
    expect(isEligible(e, ctx({ turn: 12, history: { x: 7 } }))).toBe(true);
  });

  it('never repeats once-events and never randomly picks follow-up-only events', () => {
    expect(isEligible(ev('o', { once: true }), ctx({ history: { o: 0 } }))).toBe(false);
    expect(isEligible(ev('f', { followUpOnly: true }), ctx())).toBe(false);
  });

  it('weighted pick favours heavier events and records history', () => {
    const defs = [ev('common', { weight: 9 }), ev('rare', { weight: 1 })];
    let common = 0;
    for (let i = 0; i < 2000; i++) if (selectEvent(defs, ctx(), new Rng(i))!.event.id === 'common') common++;
    expect(common / 2000).toBeGreaterThan(0.85);
    expect(common / 2000).toBeLessThan(0.95);
    const sel = selectEvent(defs, ctx(), new Rng(1))!;
    expect(sel.ctx.history[sel.event.id]).toBe(10);
  });

  it('returns null when nothing is eligible', () => {
    expect(selectEvent([ev('g', { conditions: [{ career: ['president'] }] })], ctx(), new Rng(1))).toBeNull();
  });

  it('back-to-back selection with cooldowns does not repeat an event too soon', () => {
    const defs = ['a', 'b', 'c', 'd'].map((id) => ev(id, { cooldown: 3 }));
    let c = ctx({ turn: 0 });
    const seen: string[] = [];
    for (let t = 0; t < 30; t++) {
      c = { ...c, turn: t };
      const s = selectEvent(defs, c, new Rng(`t${t}`));
      if (!s) continue;
      seen.push(`${t}:${s.event.id}`);
      c = s.ctx;
    }
    const last: Record<string, number> = {};
    for (const entry of seen) {
      const [t, id] = entry.split(':') as [string, string];
      if (last[id] !== undefined) expect(Number(t) - last[id]!).toBeGreaterThanOrEqual(3);
      last[id] = Number(t);
    }
  });
});

describe('choices and effects', () => {
  it('only offers choices whose requirements hold', () => {
    const e = ev('bribe', {
      choices: [
        { id: 'pay', label: 'Pay', requires: [{ money: 'wallet', op: 'gte', value: 5_000_000 }], outcomes: [{ weight: 1, text: '', effects: [] }] },
        { id: 'walk', label: 'Walk away', outcomes: [{ weight: 1, text: '', effects: [] }] },
      ],
    });
    expect(availableChoices(e, ctx()).map((c) => c.id)).toEqual(['walk']);
    expect(() => resolveChoice(e, 'pay', ctx(), new Rng(1))).toThrow(/not available/);
  });

  it('applies stat, money, approval, metric and flag effects with clamping', () => {
    const out = applyEffects(ctx({ stats: { ...baseStats(50), integrity: 95 } }), [
      { type: 'stat', key: 'integrity', delta: 20 },
      { type: 'money', account: 'wallet', delta: -5_000_000 },
      { type: 'money', account: 'warChest', delta: 200_000 },
      { type: 'approval', delta: 70 },
      { type: 'metric', key: 'security', delta: -5 },
      { type: 'flag', key: 'scandal_rice', set: true },
    ]);
    expect(out.stats.integrity).toBe(100);
    expect(out.money).toEqual({ wallet: 0, warChest: 200_000 });
    expect(out.approval).toBe(100);
    expect(out.metrics.security).toBe(35);
    expect(out.flags).toEqual(['scandal_rice']);
    expect(applyEffects(out, [{ type: 'flag', key: 'scandal_rice', set: false }]).flags).toEqual([]);
  });

  it('draws outcomes by weight, with stat-based weighting', () => {
    const e = ev('speech', {
      choices: [
        {
          id: 'speak',
          label: 'Speak',
          outcomes: [
            { weight: 0, statWeight: { stat: 'charisma', factor: 1 }, text: 'Crowd roars', effects: [{ type: 'approval', delta: 3 }] },
            { weight: 50, text: 'Crowd yawns', effects: [] },
          ],
        },
      ],
    });
    const roarRate = (charisma: number) => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (resolveChoice(e, 'speak', ctx({ stats: { ...baseStats(50), charisma } }), new Rng(i)).outcome.text === 'Crowd roars') n++;
      return n / 1000;
    };
    expect(roarRate(90)).toBeGreaterThan(roarRate(10) + 0.3);
  });
});

describe('follow-up chains', () => {
  const chain: EventDef[] = [
    ev('godfather_offer', {
      choices: [
        { id: 'accept', label: 'Accept', outcomes: [{ weight: 1, text: 'Deal.', effects: [{ type: 'flag', key: 'has_godfather', set: true }], followUps: [{ eventId: 'godfather_collects', delay: 3 }] }] },
      ],
    }),
    ev('godfather_collects', { followUpOnly: true, conditions: [{ flag: 'has_godfather', present: true }] }),
    ev('filler', { weight: 1000 }),
  ];

  it('schedules a follow-up with delay and fires it when due, before random events', () => {
    const r = resolveChoice(chain[0]!, 'accept', ctx({ turn: 10 }), new Rng(1));
    expect(r.ctx.scheduled).toEqual([{ eventId: 'godfather_collects', turn: 13 }]);
    const early = selectEvent(chain, { ...r.ctx, turn: 12 }, new Rng(1))!;
    expect(early.event.id).not.toBe('godfather_collects');
    const due = selectEvent(chain, { ...r.ctx, turn: 13 }, new Rng(1))!;
    expect(due.event.id).toBe('godfather_collects');
    expect(due.followUp).toBe(true);
    expect(due.ctx.scheduled).toEqual([]);
  });

  it('drops a due follow-up whose conditions no longer hold', () => {
    const c = ctx({ turn: 20, scheduled: [{ eventId: 'godfather_collects', turn: 15 }], flags: [] });
    const s = selectEvent(chain, c, new Rng(1))!;
    expect(s.event.id).toBe('filler');
    expect(s.ctx.scheduled).toEqual([]);
  });
});

describe('validateEvents', () => {
  it('accepts well-formed events', () => {
    expect(validateEvents([ev('a'), ev('b')])).toEqual([]);
  });

  it('rejects malformed events with specific messages', () => {
    const errs = validateEvents([
      { ...ev('a'), category: 'nonsense' },
      { ...ev('a') },
      { ...ev('c'), weight: 0, choices: [] },
      { ...ev('d'), conditions: [{ stat: 'luck', op: 'gte', value: 1 }] },
      {
        ...ev('e'),
        choices: [{ id: 'x', label: 'X', outcomes: [{ weight: 1, text: 't', effects: [{ type: 'money', account: 'swiss', delta: 1.5 }], followUps: [{ eventId: 'ghost', delay: 1 }] }] }],
      },
    ]);
    const joined = errs.join('\n');
    expect(joined).toMatch(/unknown category "nonsense"/);
    expect(joined).toMatch(/duplicate id/);
    expect(joined).toMatch(/weight must be > 0/);
    expect(joined).toMatch(/needs at least one choice/);
    expect(joined).toMatch(/unknown stat "luck"/);
    expect(joined).toMatch(/account must be wallet or warChest/);
    expect(joined).toMatch(/whole number/);
    expect(joined).toMatch(/unknown event "ghost"/);
  });

  it('rejects non-arrays', () => {
    expect(validateEvents({})).toEqual(['events must be an array']);
  });
});
