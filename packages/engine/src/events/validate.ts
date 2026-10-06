// Structural validator for event JSON. Returns a list of human-readable errors (empty = valid).
import { isStatKey } from '../stats.js';
import { CAREER_LEVELS, EVENT_CATEGORIES } from './types.js';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: Json): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: Json): v is string => typeof v === 'string' && v.length > 0;
const OPS = ['gte', 'lte', 'gt', 'lt', 'eq'];

function validateCondition(c: Json, at: string, errs: string[]) {
  if (!isObj(c)) return void errs.push(`${at}: condition must be an object`);
  if ('stat' in c) {
    if (!isStr(c.stat) || !isStatKey(c.stat)) errs.push(`${at}: unknown stat "${String(c.stat)}"`);
    if (!OPS.includes(String(c.op)) || !isNum(c.value)) errs.push(`${at}: stat condition needs op and numeric value`);
  } else if ('metric' in c || 'money' in c) {
    if ('money' in c && c.money !== 'wallet' && c.money !== 'warChest') errs.push(`${at}: money must be wallet or warChest`);
    if (!OPS.includes(String(c.op)) || !isNum(c.value)) errs.push(`${at}: condition needs op and numeric value`);
  } else if ('approval' in c) {
    if (!OPS.includes(String(c.approval)) || !isNum(c.value)) errs.push(`${at}: approval condition needs op and numeric value`);
  } else if ('career' in c) {
    if (!Array.isArray(c.career) || !c.career.length || !c.career.every((x) => (CAREER_LEVELS as readonly string[]).includes(String(x))))
      errs.push(`${at}: career must be a non-empty list of valid career levels`);
  } else if ('phase' in c) {
    if (!Array.isArray(c.phase) || !c.phase.every(isStr)) errs.push(`${at}: phase must be a list of strings`);
  } else if ('flag' in c) {
    if (!isStr(c.flag) || typeof c.present !== 'boolean') errs.push(`${at}: flag condition needs flag and present`);
  } else errs.push(`${at}: unknown condition type`);
}

function validateEffect(e: Json, at: string, errs: string[]) {
  if (!isObj(e)) return void errs.push(`${at}: effect must be an object`);
  switch (e.type) {
    case 'stat':
      if (!isStr(e.key) || !isStatKey(e.key)) errs.push(`${at}: unknown stat "${String(e.key)}"`);
      if (!isNum(e.delta)) errs.push(`${at}: delta must be a number`);
      break;
    case 'money':
      if (e.account !== 'wallet' && e.account !== 'warChest') errs.push(`${at}: account must be wallet or warChest`);
      if (!isNum(e.delta) || !Number.isInteger(e.delta)) errs.push(`${at}: money delta must be a whole number`);
      break;
    case 'approval':
      if (!isNum(e.delta)) errs.push(`${at}: delta must be a number`);
      break;
    case 'metric':
      if (!isStr(e.key) || !isNum(e.delta)) errs.push(`${at}: metric effect needs key and delta`);
      break;
    case 'flag':
      if (!isStr(e.key) || typeof e.set !== 'boolean') errs.push(`${at}: flag effect needs key and set`);
      break;
    default:
      errs.push(`${at}: unknown effect type "${String(e.type)}"`);
  }
}

export function validateEvents(input: Json): string[] {
  const errs: string[] = [];
  if (!Array.isArray(input)) return ['events must be an array'];
  const ids = new Set<string>();
  const followUpRefs: { at: string; id: string }[] = [];

  input.forEach((ev, i) => {
    const at = `event[${i}]${isObj(ev) && isStr(ev.id) ? ` (${ev.id})` : ''}`;
    if (!isObj(ev)) return void errs.push(`${at}: must be an object`);
    if (!isStr(ev.id)) errs.push(`${at}: missing id`);
    else if (ids.has(ev.id)) errs.push(`${at}: duplicate id`);
    else ids.add(ev.id);
    if (!(EVENT_CATEGORIES as readonly string[]).includes(String(ev.category))) errs.push(`${at}: unknown category "${String(ev.category)}"`);
    if (!isStr(ev.title)) errs.push(`${at}: missing title`);
    if (!isStr(ev.text)) errs.push(`${at}: missing text`);
    if (!isNum(ev.weight) || ev.weight <= 0) errs.push(`${at}: weight must be > 0`);
    if (!isNum(ev.cooldown) || ev.cooldown < 0) errs.push(`${at}: cooldown must be >= 0`);
    if (!Array.isArray(ev.conditions)) errs.push(`${at}: conditions must be an array`);
    else ev.conditions.forEach((c, j) => validateCondition(c, `${at}.conditions[${j}]`, errs));
    if (!Array.isArray(ev.choices) || ev.choices.length === 0) return void errs.push(`${at}: needs at least one choice`);
    const choiceIds = new Set<string>();
    ev.choices.forEach((ch, j) => {
      const cat = `${at}.choices[${j}]`;
      if (!isObj(ch)) return void errs.push(`${cat}: must be an object`);
      if (!isStr(ch.id)) errs.push(`${cat}: missing id`);
      else if (choiceIds.has(ch.id)) errs.push(`${cat}: duplicate choice id`);
      else choiceIds.add(ch.id);
      if (!isStr(ch.label)) errs.push(`${cat}: missing label`);
      if (ch.requires !== undefined) {
        if (!Array.isArray(ch.requires)) errs.push(`${cat}: requires must be an array`);
        else ch.requires.forEach((c, k) => validateCondition(c, `${cat}.requires[${k}]`, errs));
      }
      if (!Array.isArray(ch.outcomes) || ch.outcomes.length === 0) return void errs.push(`${cat}: needs at least one outcome`);
      ch.outcomes.forEach((o, k) => {
        const oat = `${cat}.outcomes[${k}]`;
        if (!isObj(o)) return void errs.push(`${oat}: must be an object`);
        if (!isNum(o.weight) || o.weight < 0) errs.push(`${oat}: weight must be >= 0`);
        if (o.statWeight !== undefined && (!isObj(o.statWeight) || !isStr(o.statWeight.stat) || !isStatKey(o.statWeight.stat) || !isNum(o.statWeight.factor)))
          errs.push(`${oat}: bad statWeight`);
        if (!isStr(o.text)) errs.push(`${oat}: missing text`);
        if (!Array.isArray(o.effects)) errs.push(`${oat}: effects must be an array`);
        else o.effects.forEach((e, m) => validateEffect(e, `${oat}.effects[${m}]`, errs));
        if (o.followUps !== undefined) {
          if (!Array.isArray(o.followUps)) errs.push(`${oat}: followUps must be an array`);
          else
            o.followUps.forEach((f, m) => {
              if (!isObj(f) || !isStr(f.eventId) || !isNum(f.delay) || f.delay < 0) errs.push(`${oat}.followUps[${m}]: needs eventId and delay >= 0`);
              else followUpRefs.push({ at: `${oat}.followUps[${m}]`, id: f.eventId });
            });
        }
      });
    });
  });

  for (const r of followUpRefs) if (!ids.has(r.id)) errs.push(`${r.at}: follow-up references unknown event "${r.id}"`);
  return errs;
}
