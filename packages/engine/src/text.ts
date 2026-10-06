// Template text: {variable}, inline variations {a|b|c}, and named pools {#pool}.
// Pool entries may themselves contain templates. No external AI is used.
import type { Rng } from './rng.js';

export type TextPools = Record<string, string[]>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const MAX_DEPTH = 6;

export function renderTemplate(template: string, vars: Record<string, string | number>, rng: Rng, pools: TextPools = {}, depth = 0): string {
  if (depth > MAX_DEPTH) throw new TemplateError('Template nesting too deep (pool cycle?)');
  return template.replace(/\{([^{}]+)\}/g, (_, raw: string) => {
    const body = raw.trim();
    if (body.startsWith('#')) {
      const pool = pools[body.slice(1)];
      if (!pool || pool.length === 0) throw new TemplateError(`Unknown or empty pool "${body.slice(1)}"`);
      return renderTemplate(rng.pick(pool), vars, rng, pools, depth + 1);
    }
    if (body.includes('|')) {
      return renderTemplate(rng.pick(body.split('|')), vars, rng, pools, depth + 1);
    }
    const v = vars[body];
    if (v === undefined) throw new TemplateError(`Missing template variable "${body}"`);
    return String(v);
  });
}

/** Variable names a template needs (excluding pools and inline variations). */
export function templateVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{([^{}]+)\}/g)) {
    const body = (m[1] ?? '').trim();
    if (!body.startsWith('#') && !body.includes('|')) out.add(body);
  }
  return [...out];
}
