import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, BACKGROUND_IDS, INCOMPATIBLE_TRAITS, TRAITS, TRAIT_IDS, buildCharacter, validateCharacter, validateName, type CharacterInput } from '../src/character.js';
import { STAT_KEYS } from '../src/stats.js';

const valid: CharacterInput = {
  name: 'Ngozi Okafor',
  gender: 'female',
  age: 34,
  homeStateCode: 'AN',
  homeLgaId: 'AN-017',
  background: 'lawyer',
  traits: ['silver_tongue', 'clean_hands'],
};

describe('backgrounds', () => {
  it('has the 10 backgrounds from the spec, each with all stats in range, money and a perk', () => {
    expect(BACKGROUND_IDS).toHaveLength(10);
    for (const id of BACKGROUND_IDS) {
      const b = BACKGROUNDS[id];
      for (const k of STAT_KEYS) {
        expect(b.stats[k], `${id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(b.stats[k], `${id}.${k}`).toBeLessThanOrEqual(100);
      }
      expect(b.startingWallet).toBeGreaterThan(0);
      expect(b.perks.length).toBeGreaterThan(0);
    }
  });

  it('keeps backgrounds roughly balanced (stat totals within 50 points of each other)', () => {
    const totals = BACKGROUND_IDS.map((id) => STAT_KEYS.reduce((s, k) => s + BACKGROUNDS[id].stats[k], 0));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(50);
  });
});

describe('traits', () => {
  it('has at least 12 traits including the spec examples', () => {
    expect(TRAIT_IDS.length).toBeGreaterThanOrEqual(12);
    expect(TRAIT_IDS).toEqual(expect.arrayContaining(['silver_tongue', 'grassroots_hero', 'deep_pockets', 'clean_hands', 'godfathers_child', 'social_media_star']));
  });

  it('requires exactly 2 distinct known traits', () => {
    const errs = (traits: string[]) => {
      const r = validateCharacter({ ...valid, traits });
      return r.ok ? null : r.errors.traits;
    };
    expect(errs(['silver_tongue'])).toMatch(/exactly 2/);
    expect(errs(['silver_tongue', 'workhorse', 'bookworm'])).toMatch(/exactly 2/);
    expect(errs(['workhorse', 'workhorse'])).toMatch(/different/);
    expect(errs(['workhorse', 'flying'])).toMatch(/Unknown/);
  });

  it('rejects every incompatible pair', () => {
    for (const [a, b] of INCOMPATIBLE_TRAITS) {
      const r = validateCharacter({ ...valid, traits: [a, b] });
      expect(r.ok, `${a}+${b}`).toBe(false);
      if (!r.ok) expect(r.errors.traits).toMatch(/cannot go together/);
    }
  });
});

describe('validateCharacter', () => {
  it('accepts a valid character', () => {
    expect(validateCharacter(valid)).toEqual({ ok: true });
  });

  it('enforces age 25 to 60 as a whole number', () => {
    for (const age of [24, 61, 30.5]) expect(validateCharacter({ ...valid, age }).ok).toBe(false);
    for (const age of [25, 60]) expect(validateCharacter({ ...valid, age }).ok).toBe(true);
  });

  it('checks the home LGA belongs to the home state', () => {
    expect(validateCharacter({ ...valid, homeLgaId: 'LA-001' }).ok).toBe(false); // wrong state prefix
    expect(validateCharacter({ ...valid, homeLgaId: 'AN-022' }).ok).toBe(false); // Anambra has 21
    expect(validateCharacter({ ...valid, homeLgaId: 'AN-021' }).ok).toBe(true);
    expect(validateCharacter({ ...valid, homeStateCode: 'XX' }).ok).toBe(false);
  });

  it('rejects unknown backgrounds and genders', () => {
    expect(validateCharacter({ ...valid, background: 'astronaut' }).ok).toBe(false);
    expect(validateCharacter({ ...valid, gender: 'x' as never }).ok).toBe(false);
  });
});

describe('validateName', () => {
  it('requires first name and surname with allowed characters', () => {
    expect(validateName('Ngozi')).toMatch(/first name and surname/);
    expect(validateName('A')).toMatch(/3 to 40/);
    expect(validateName('Ngozi <script>')).toMatch(/only contain/);
    expect(validateName("Tunde O'Brien-Ade")).toBeNull();
    expect(validateName('Chief Dr. Emeka Eze')).toBeNull();
  });

  it('blocks names using real politicians surnames', () => {
    expect(validateName('Bola Tinubu')).toMatch(/real politician/);
    expect(validateName('Femi Fashola-Ade')).toMatch(/real politician/);
  });
});

describe('buildCharacter', () => {
  it('combines background stats with trait mods and starting money', () => {
    const c = buildCharacter(valid);
    const b = BACKGROUNDS.lawyer.stats;
    expect(c.stats.charisma).toBe(b.charisma + 10);
    expect(c.stats.mediaSkill).toBe(b.mediaSkill + 5);
    expect(c.stats.integrity).toBe(b.integrity + 15);
    expect(c.stats.connections).toBe(b.connections - 5);
    expect(c.wallet).toBe(BACKGROUNDS.lawyer.startingWallet);
    expect(c.warChest).toBe(0);
  });

  it('adds wallet bonus for Deep Pockets', () => {
    const c = buildCharacter({ ...valid, traits: ['deep_pockets', 'workhorse'] });
    expect(c.wallet).toBe(BACKGROUNDS.lawyer.startingWallet + (TRAITS.deep_pockets.walletBonus ?? 0));
  });

  it('throws for invalid input', () => {
    expect(() => buildCharacter({ ...valid, age: 70 })).toThrow(/Invalid character/);
  });
});
