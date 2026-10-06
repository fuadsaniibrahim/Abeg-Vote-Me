import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.js';
import { TemplateError, renderTemplate, templateVariables } from '../src/text.js';

describe('template text', () => {
  it('substitutes variables', () => {
    expect(renderTemplate('{playerName} don land for {state}!', { playerName: 'Ngozi', state: 'Enugu' }, new Rng(1))).toBe('Ngozi don land for Enugu!');
  });

  it('picks inline variations deterministically from the seed', () => {
    const t = '{Wahala|Gbege|Palava} for {rival}';
    const a = renderTemplate(t, { rival: 'Chief X' }, new Rng('v'));
    expect(a).toBe(renderTemplate(t, { rival: 'Chief X' }, new Rng('v')));
    expect(a).toMatch(/^(Wahala|Gbege|Palava) for Chief X$/);
    const seen = new Set(Array.from({ length: 50 }, (_, i) => renderTemplate(t, { rival: 'Y' }, new Rng(i)).split(' ')[0]));
    expect(seen.size).toBe(3);
  });

  it('expands named pools, including variables and variations inside pool entries', () => {
    const pools = { reaction: ['{Na wa|Haba}, {playerName}!', 'Who send {playerName} message?'] };
    const out = renderTemplate('{#reaction}', { playerName: 'Tunde' }, new Rng(3), pools);
    expect(['Na wa, Tunde!', 'Haba, Tunde!', 'Who send Tunde message?']).toContain(out);
  });

  it('throws on missing variables, unknown pools and cyclic pools', () => {
    expect(() => renderTemplate('{scandal}', {}, new Rng(1))).toThrow(TemplateError);
    expect(() => renderTemplate('{#nope}', {}, new Rng(1))).toThrow(/Unknown or empty pool/);
    expect(() => renderTemplate('{#loop}', {}, new Rng(1), { loop: ['{#loop}'] })).toThrow(/too deep/);
  });

  it('lists the variables a template needs', () => {
    expect(templateVariables('{playerName} vs {rival|x} {#pool} {state} {playerName}').sort()).toEqual(['playerName', 'state']);
  });
});
