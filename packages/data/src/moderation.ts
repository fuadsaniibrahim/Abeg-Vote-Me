// Word lists for the chat/name filter. Deliberately small; see KNOWN_GAPS.md (needs a curated list).
// PROFANITY: masked with asterisks. BLOCKED_PATTERNS: message rejected outright (incitement, threats).

export const PROFANITY = ['fuck', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'ashawo', 'mumu', 'dickhead'];

/** Regex sources (case-insensitive) for content that is never allowed. */
export const BLOCKED_PATTERNS = [
  String.raw`\bkill (all|every|them all)\b`,
  String.raw`\b(wipe|wiping) (them|all of them) out\b`,
  String.raw`\bexterminate\b`,
  String.raw`\bethnic cleansing\b`,
  String.raw`\b(burn|bomb) (their|the) (church|mosque|village|market)s?\b`,
];
