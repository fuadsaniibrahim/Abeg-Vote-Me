import { Rng } from '../rng.js';
import { applyStatMods } from '../stats.js';
import { clamp } from '../rng.js';
import type { Choice, CompareOp, Condition, Effect, EventContext, EventDef, Outcome } from './types.js';

export function compare(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case 'gte':
      return a >= b;
    case 'lte':
      return a <= b;
    case 'gt':
      return a > b;
    case 'lt':
      return a < b;
    case 'eq':
      return a === b;
  }
}

export function checkCondition(c: Condition, ctx: EventContext): boolean {
  if ('stat' in c) return compare(ctx.stats[c.stat], c.op, c.value);
  if ('metric' in c) return compare(ctx.metrics[c.metric] ?? 0, c.op, c.value);
  if ('money' in c) return compare(ctx.money[c.money], c.op, c.value);
  if ('approval' in c) return compare(ctx.approval, c.approval, c.value);
  if ('career' in c) return c.career.includes(ctx.career);
  if ('phase' in c) return c.phase.includes(ctx.phase);
  return ctx.flags.includes(c.flag) === c.present;
}

export function checkAll(conds: Condition[] | undefined, ctx: EventContext): boolean {
  return (conds ?? []).every((c) => checkCondition(c, ctx));
}

/** Eligible for random selection: conditions hold, not on cooldown, not a used once-event, not follow-up-only. */
export function isEligible(def: EventDef, ctx: EventContext): boolean {
  if (def.followUpOnly) return false;
  const last = ctx.history[def.id];
  if (last !== undefined) {
    if (def.once) return false;
    if (ctx.turn - last < def.cooldown) return false;
  }
  return checkAll(def.conditions, ctx);
}

export interface Selection {
  event: EventDef;
  /** True when a scheduled follow-up fired. */
  followUp: boolean;
  ctx: EventContext;
}

/**
 * Pick the next event. Due follow-ups fire first (earliest scheduled); otherwise a weighted random
 * pick among eligible events. Returns null if nothing is eligible. Records the event in history.
 */
export function selectEvent(defs: EventDef[], ctx: EventContext, rng: Rng): Selection | null {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const due = ctx.scheduled.filter((s) => s.turn <= ctx.turn).sort((a, b) => a.turn - b.turn || a.eventId.localeCompare(b.eventId));
  for (const s of due) {
    const def = byId.get(s.eventId);
    const remaining = ctx.scheduled.filter((x) => x !== s);
    if (!def) {
      ctx = { ...ctx, scheduled: remaining };
      continue;
    }
    if (!checkAll(def.conditions, ctx)) {
      ctx = { ...ctx, scheduled: remaining };
      continue;
    }
    return { event: def, followUp: true, ctx: { ...ctx, scheduled: remaining, history: { ...ctx.history, [def.id]: ctx.turn } } };
  }
  const eligible = defs.filter((d) => isEligible(d, ctx));
  if (!eligible.length) return null;
  const event = rng.weighted(eligible, (d) => d.weight);
  return { event, followUp: false, ctx: { ...ctx, history: { ...ctx.history, [event.id]: ctx.turn } } };
}

export function availableChoices(def: EventDef, ctx: EventContext): Choice[] {
  return def.choices.filter((c) => checkAll(c.requires, ctx));
}

export function applyEffects(ctx: EventContext, effects: Effect[]): EventContext {
  let next: EventContext = { ...ctx, flags: [...ctx.flags], metrics: { ...ctx.metrics }, money: { ...ctx.money } };
  for (const e of effects) {
    switch (e.type) {
      case 'stat':
        next = { ...next, stats: applyStatMods(next.stats, { [e.key]: e.delta }) };
        break;
      case 'money':
        // money never goes negative; effects that would overdraw are capped at zero
        next.money[e.account] = Math.max(0, next.money[e.account] + e.delta);
        break;
      case 'approval':
        next.approval = clamp(next.approval + e.delta, 0, 100);
        break;
      case 'metric':
        next.metrics[e.key] = (next.metrics[e.key] ?? 0) + e.delta;
        break;
      case 'flag':
        next.flags = e.set ? [...new Set([...next.flags, e.key])] : next.flags.filter((f) => f !== e.key);
        break;
    }
  }
  return next;
}

export function outcomeWeight(o: Outcome, ctx: EventContext): number {
  return Math.max(0, o.weight + (o.statWeight ? ctx.stats[o.statWeight.stat] * o.statWeight.factor : 0));
}

export interface Resolution {
  outcome: Outcome;
  ctx: EventContext;
}

/** Resolve a player's choice: draw an outcome by weight, apply effects, schedule follow-ups. */
export function resolveChoice(def: EventDef, choiceId: string, ctx: EventContext, rng: Rng): Resolution {
  const choice = availableChoices(def, ctx).find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Choice "${choiceId}" is not available for event "${def.id}"`);
  const outcome = choice.outcomes.length === 1 ? (choice.outcomes[0] as Outcome) : rng.weighted(choice.outcomes, (o) => outcomeWeight(o, ctx));
  let next = applyEffects(ctx, outcome.effects);
  if (outcome.followUps?.length) {
    next = { ...next, scheduled: [...next.scheduled, ...outcome.followUps.map((f) => ({ eventId: f.eventId, turn: ctx.turn + f.delay }))] };
  }
  return { outcome, ctx: next };
}
