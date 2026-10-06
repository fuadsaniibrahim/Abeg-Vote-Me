import { STAT_KEYS, STAT_LABELS, type Stats } from '@avm/engine';

export function StatBars({ stats }: { stats: Stats }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Stats">
      {STAT_KEYS.map((k) => (
        <li key={k}>
          <div className="flex justify-between text-xs">
            <span>{STAT_LABELS[k]}</span>
            <span className="font-semibold tabular-nums">{stats[k]}</span>
          </div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10" role="meter" aria-label={STAT_LABELS[k]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats[k]}>
            <div className="h-2 rounded-full bg-naija-600" style={{ width: `${stats[k]}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
