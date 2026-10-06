import { describe, expect, it } from 'vitest';
import { filterMessage, mentionsRealPolitician, MAX_MESSAGE_LENGTH } from '../src/filter.js';

describe('chat filter', () => {
  it('passes clean messages unchanged', () => {
    expect(filterMessage('Good morning Naija!  How una dey?')).toEqual({ ok: true, text: 'Good morning Naija! How una dey?', masked: false });
  });

  it('masks profanity, including leetspeak evasion', () => {
    const r = filterMessage('this policy is shit and sh1t');
    expect(r).toEqual({ ok: true, text: 'this policy is s*** and s***', masked: true });
    expect(filterMessage('Fuck!')).toMatchObject({ ok: true, text: 'F***!' });
  });

  it('does not mask words that merely contain a profanity substring', () => {
    expect(filterMessage('Scunthorpe and shitake? No, shiitake mushrooms')).toMatchObject({ ok: true, masked: false });
  });

  it('rejects incitement and threats', () => {
    for (const m of ['We should kill all of them', 'ethnic cleansing now', 'burn their village', 'k1ll all']) {
      expect(filterMessage(m).ok, m).toBe(false);
    }
  });

  it('rejects empty and over-long messages', () => {
    expect(filterMessage('   ').ok).toBe(false);
    expect(filterMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)).ok).toBe(false);
    expect(filterMessage('a'.repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
  });

  it('detects mentions of real politicians', () => {
    expect(mentionsRealPolitician('Vote Tinubu 2027')).toBe(true);
    expect(mentionsRealPolitician('Fix our roads now')).toBe(false);
  });
});
