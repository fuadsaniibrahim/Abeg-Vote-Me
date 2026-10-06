import { Link } from 'react-router-dom';
import { TRAITS, formatNaira, type TraitId } from '@avm/engine';
import { Page } from '../components/Layout';
import { Card } from '../components/ui';
import { relativeDays, shortDate } from '../components/seats';
import { StatBars } from '../components/StatBars';
import { GameClock } from '../components/AppShell';
import { useGame } from '../store/game';

export function DashboardScreen() {
  const profile = useGame((s) => s.profile);
  if (!profile) return null;
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Card>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm opacity-75">
            <GameClock />
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs opacity-70">Office</dt>
              <dd className="font-semibold">
                {profile.office ? (
                  <Link to={`/seats/${profile.office.id}`} className="underline underline-offset-2">
                    {profile.office.name}
                  </Link>
                ) : (
                  'Citizen'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Party</dt>
              <dd className="font-semibold">{profile.party ? profile.party.name : 'No party'}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Wallet</dt>
              <dd className="font-semibold tabular-nums">{formatNaira(profile.wallet)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">War chest</dt>
              <dd className="font-semibold tabular-nums">{formatNaira(profile.warChest)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Energy</dt>
              <dd className="font-semibold tabular-nums">{profile.energy}/100</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Public image</dt>
              <dd className="font-semibold tabular-nums">{profile.stats.publicImage}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Businesses</dt>
              <dd className="font-semibold tabular-nums">{profile.activeBusinesses}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Journalist rep</dt>
              <dd className="font-semibold tabular-nums">{profile.journalistRep}</dd>
            </div>
          </dl>
        </Card>
        {profile.office && (
          <Card>
            <h2 className="mb-2 font-semibold">Your office</h2>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs opacity-70">In office since</dt>
                <dd className="font-semibold">{shortDate(profile.office.since)}</dd>
              </div>
              {profile.office.termEndsAt && (
                <div>
                  <dt className="text-xs opacity-70">Term ends</dt>
                  <dd className="font-semibold">{relativeDays(profile.office.termEndsAt)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs opacity-70">Monthly salary</dt>
                <dd className="font-semibold tabular-nums">{formatNaira(profile.office.monthlySalary)}</dd>
              </div>
            </dl>
          </Card>
        )}
        <Card>
          <h2 className="mb-3 font-semibold">Your stats</h2>
          <StatBars stats={profile.stats} />
          <p className="mt-3 text-xs opacity-70">Traits: {profile.traits.map((t) => TRAITS[t as TraitId]?.label ?? t).join(', ')}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Upcoming</h2>
          <p className="text-sm opacity-75">No elections are scheduled yet. Build your name: join a party, attend rallies, start a business.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {!profile.party && (
              <Link className="rounded-lg bg-naija-600 px-3 py-2 font-semibold text-white" to="/parties">
                Join a party
              </Link>
            )}
            <Link className="rounded-lg border border-naija-600/40 px-3 py-2 font-semibold" to="/actions">
              Take action
            </Link>
            <Link className="rounded-lg border border-naija-600/40 px-3 py-2 font-semibold" to={`/map/${profile.homeStateCode}`}>
              Seats in {profile.homeStateName}
            </Link>
          </div>
        </Card>
      </div>
    </Page>
  );
}
