import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { worldApi, type WorldSummary } from '../api/client';
import { Disclaimer } from '../components/Disclaimer';
import { Page } from '../components/Layout';
import { useAuth } from '../store/auth';

const fmt = new Intl.NumberFormat('en-NG');

export function StartScreen() {
  const user = useAuth((s) => s.user);
  const [world, setWorld] = useState<WorldSummary | null>(null);

  useEffect(() => {
    worldApi
      .summary()
      .then(setWorld)
      .catch(() => setWorld(null));
  }, []);

  return (
    <Page>
      <section className="flex flex-col gap-6 pt-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-naija-600">A fictional Nigeria. Real wahala.</p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
            From citizen to <span className="text-naija-600">Aso Rock</span>. Abeg, vote me!
          </h1>
          <p className="mt-4 text-lg opacity-80">
            Start as an ordinary citizen. Join a party, fight primaries, run campaigns, survive the press, and climb to councillor, Rep, Senator, Governor
            or President. Play clean or play dirty. Every choice get consequence.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {user ? (
            <Link to="/dashboard" className="rounded-xl bg-naija-600 px-5 py-3 text-center font-semibold text-white hover:bg-naija-700">
              Continue your career
            </Link>
          ) : (
            <>
              <Link to="/register" className="rounded-xl bg-naija-600 px-5 py-3 text-center font-semibold text-white hover:bg-naija-700">
                Create account
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-naija-600/40 px-5 py-3 text-center font-semibold text-naija-700 hover:bg-naija-50 dark:text-naija-100 dark:hover:bg-naija-900/50"
              >
                Log in
              </Link>
            </>
          )}
        </div>

        {world?.seeded && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="World at a glance">
            {[
              ['States + FCT', world.counts.states],
              ['LGAs', world.counts.lgas],
              ['Seats up for grabs', world.counts.seats],
              ['Held by players', world.seatsHeldByPlayers],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <dt className="text-xs opacity-70">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums">{fmt.format(Number(n ?? 0))}</dd>
              </div>
            ))}
          </dl>
        )}

        <Disclaimer />
      </section>
    </Page>
  );
}
