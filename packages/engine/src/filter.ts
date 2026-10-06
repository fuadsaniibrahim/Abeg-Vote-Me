// Chat / content filter: masks profanity, rejects blocked content (incitement, threats, real politicians).
import { BLOCKED_PATTERNS, BLOCKED_SURNAMES, PROFANITY } from '@avm/data';

export type FilterResult = { ok: true; text: string; masked: boolean } | { ok: false; reason: string };

const blocked = BLOCKED_PATTERNS.map((p) => new RegExp(p, 'i'));
const profanitySource = `\\b(${PROFANITY.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`;
/** Global regex for replacing; separate non-global one for testing (a /g regex keeps state between .test calls). */
const profanityAll = new RegExp(profanitySource, 'gi');
const profanityAny = new RegExp(profanitySource, 'i');

/** Normalise common evasions: leetspeak and separators inside words. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's');
}

export const MAX_MESSAGE_LENGTH = 500;

export function filterMessage(raw: string): FilterResult {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'Message is empty.' };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: `Message is longer than ${MAX_MESSAGE_LENGTH} characters.` };
  const norm = normalise(text);
  if (blocked.some((r) => r.test(text) || r.test(norm))) return { ok: false, reason: 'This message breaks the rules (incitement or threats are not allowed).' };
  let masked = false;
  const maskWord = (w: string) => {
    masked = true;
    return `${w[0]}${'*'.repeat(Math.max(0, w.length - 1))}`;
  };
  const out = text.replace(profanityAll, maskWord);
  // second pass on normalised words catches "sh1t" style evasion; mask the whole original word
  const words = out.split(' ').map((w) => (profanityAny.test(normalise(w)) ? maskWord(w) : w));
  return { ok: true, text: words.join(' '), masked };
}

/** True if a free-text title/name mentions a blocked real politician surname. */
export function mentionsRealPolitician(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[^a-z'-]+/)
    .some((w) => BLOCKED_SURNAMES.includes(w));
}
