// Deterministic SVG avatar from a seed: no image assets.
const SKIN = ['#8d5524', '#a0662f', '#6b3e1f', '#c68642', '#4a2c17', '#7a4a26'];
const BG = ['#008751', '#0e7490', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f'];
const ATTIRE = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#f97316', '#14b8a6'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function avatarParts(seed: string) {
  const h = hash(seed);
  const pick = <T,>(arr: T[], shift: number) => arr[(h >>> shift) % arr.length] as T;
  return { skin: pick(SKIN, 0), bg: pick(BG, 5), attire: pick(ATTIRE, 10), cap: (h >>> 15) % 3, eyes: (h >>> 18) % 2 };
}

export function Avatar({ seed, name, size = 48 }: { seed: string; name: string; size?: number }) {
  const p = avatarParts(seed);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Avatar of ${name}`} className="shrink-0 rounded-full">
      <rect width="64" height="64" fill={p.bg} />
      <path d="M8 64c2-14 12-20 24-20s22 6 24 20z" fill={p.attire} />
      <circle cx="32" cy="28" r="13" fill={p.skin} />
      {p.cap === 1 && <path d="M18 22c2-9 26-9 28 0z" fill="#b91c1c" />}
      {p.cap === 2 && <rect x="19" y="13" width="26" height="8" rx="3" fill="#111827" />}
      <circle cx="27" cy="28" r={p.eyes ? 1.6 : 1.2} fill="#111" />
      <circle cx="37" cy="28" r={p.eyes ? 1.6 : 1.2} fill="#111" />
      <path d="M27 34q5 4 10 0" stroke="#111" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
