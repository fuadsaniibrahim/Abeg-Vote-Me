import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Holder, Seat } from '../api/client';

const DAY = 86_400_000;

/** "in 12 days", "3 days ago", "today". */
export function relativeDays(iso: string, nowMs = Date.now()): string {
  const d = Math.round((new Date(iso).getTime() - nowMs) / DAY);
  if (d === 0) return 'today';
  return d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `${-d} day${d === -1 ? '' : 's'} ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Black or white text, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#10231a' : '#ffffff';
}

export const VACANT_COLOR = '#9ca3af';

export function PartyBadge({ party }: { party: { code: string; color: string } | null }) {
  if (!party) return <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-black/15 dark:ring-white/20">No party</span>;
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: party.color, color: textOn(party.color) }}>
      {party.code}
    </span>
  );
}

function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warn' | 'player' }) {
  const styles = {
    plain: 'bg-black/5 dark:bg-white/10',
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
    player: 'bg-naija-100 text-naija-900 dark:bg-naija-900/60 dark:text-naija-50',
  }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${styles}`}>{children}</span>;
}

/** Holder name with party and status tags; "Vacant" when nobody holds the seat. */
export function HolderLine({ holder }: { holder: Holder | null }) {
  if (!holder) return <span className="text-sm font-semibold opacity-70">Vacant</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="font-semibold">{holder.name}</span>
      <PartyBadge party={holder.party} />
      <Tag tone={holder.type === 'player' ? 'player' : 'plain'}>{holder.type === 'player' ? 'Player' : 'NPC'}</Tag>
      {holder.holdingOver && <Tag tone="warn">Holding over</Tag>}
      {holder.autopilot && <Tag tone="warn">Autopilot</Tag>}
    </span>
  );
}

/** A seat as a tappable row: office name on top, holder below. */
export function SeatLink({ seat, label }: { seat: Seat; label?: string }) {
  return (
    <Link to={`/seats/${seat.id}`} className="flex flex-col gap-1 rounded-xl border border-black/10 px-3 py-2 hover:border-naija-600/50 dark:border-white/10">
      <span className="text-xs opacity-70">{label ?? seat.name}</span>
      <HolderLine holder={seat.holder} />
    </Link>
  );
}

export function Breadcrumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 opacity-80">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {it.to ? (
              <Link to={it.to} className="underline-offset-2 hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Keyboard support for SVG shapes acting as links. */
export function linkKeys(go: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };
}

export interface Tile {
  key: string;
  col: number;
  row: number;
  label: string;
  ariaLabel: string;
  color: string;
}

/** Grid of square tiles in an SVG; each tile is a keyboard-accessible link. */
export function TileMap({ tiles, onPick, size = 56, gap = 4, title }: { tiles: Tile[]; onPick: (key: string) => void; size?: number; gap?: number; title: string }) {
  const cols = Math.max(...tiles.map((t) => t.col)) + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) + 1;
  const step = size + gap;
  return (
    <svg viewBox={`0 0 ${cols * step} ${rows * step}`} className="h-auto w-full" role="group" aria-label={title}>
      {tiles.map((t) => (
        <g
          key={t.key}
          role="link"
          tabIndex={0}
          aria-label={t.ariaLabel}
          className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3px] [&:hover>rect]:opacity-85"
          onClick={() => onPick(t.key)}
          onKeyDown={linkKeys(() => onPick(t.key))}
        >
          <title>{t.ariaLabel}</title>
          <rect x={t.col * step} y={t.row * step} width={size} height={size} rx={8} fill={t.color} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <text
            x={t.col * step + size / 2}
            y={t.row * step + size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size / (t.label.length > 4 ? 5 : 3.4)}
            fontWeight={700}
            fill={textOn(t.color)}
            pointerEvents="none"
          >
            {t.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function PartyLegend({ parties }: { parties: { code: string; name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Party colours">
      {parties.map((p) => (
        <li key={p.code} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: p.color }} />
          {p.name}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: VACANT_COLOR }} />
        Vacant / no party
      </li>
    </ul>
  );
}
