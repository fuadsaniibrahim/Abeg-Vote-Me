import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, gameApi, type StateMap } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Card } from '../components/ui';
import { Breadcrumbs, HolderLine, SeatLink, TileMap, VACANT_COLOR, type Tile } from '../components/seats';

/** Short tile label for an LGA name: one short word as is, else up to 5 letters. */
export function lgaLabel(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  const w = words[0] ?? name;
  return w.length <= 6 ? w : w.slice(0, 5);
}

export function StateMapScreen() {
  const { code = '' } = useParams();
  const [data, setData] = useState<StateMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setData(null);
    setError(null);
    gameApi
      .stateMap(code)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this state.'));
  }, [code]);

  const cols = data ? Math.max(4, Math.ceil(Math.sqrt(data.lgas.length * 1.2))) : 1;
  const tiles: Tile[] =
    data?.lgas.map((l, i) => {
      const h = l.chairman.holder;
      return {
        key: l.id,
        col: i % cols,
        row: Math.floor(i / cols),
        label: lgaLabel(l.name),
        ariaLabel: `${l.name} LGA: Chairman ${h ? `${h.name} (${h.party?.code ?? 'no party'})` : 'vacant'}`,
        color: h?.party?.color ?? VACANT_COLOR,
      };
    }) ?? [];

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ to: '/map', label: 'Nigeria' }, { label: data?.state.name ?? code }]} />
        {error && <Alert>{error}</Alert>}
        {!data && !error && <p role="status">Loading…</p>}
        {data && (
          <>
            <Card>
              <h1 className="text-2xl font-bold">{data.state.isFct ? data.state.name : `${data.state.name} State`}</h1>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs opacity-70">Capital</dt>
                  <dd className="font-semibold">{data.state.capital}</dd>
                </div>
                <div>
                  <dt className="text-xs opacity-70">Population</dt>
                  <dd className="font-semibold tabular-nums">{data.state.population.toLocaleString('en-NG')}</dd>
                </div>
                <div>
                  <dt className="text-xs opacity-70">Wealth</dt>
                  <dd className="font-semibold tabular-nums">{data.state.wealth}/100</dd>
                </div>
                <div>
                  <dt className="text-xs opacity-70">Insecurity</dt>
                  <dd className="font-semibold tabular-nums">{data.state.insecurity}/100</dd>
                </div>
              </dl>
            </Card>

            {!data.state.isFct && (
              <Card className="flex flex-col gap-2">
                <h2 className="font-semibold">Executive</h2>
                {data.governor && <SeatLink seat={data.governor} label="Governor" />}
                {data.deputyGovernor && <SeatLink seat={data.deputyGovernor} label="Deputy Governor" />}
              </Card>
            )}

            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Senate</h2>
              {data.senators.map((s) => (
                <SeatLink key={s.id} seat={s} label={`Senator, ${s.districtName}`} />
              ))}
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">Local governments ({data.lgas.length})</h2>
              <p className="text-xs opacity-70">Coloured by the chairman&apos;s party. Tap one to see its wards.</p>
              <TileMap tiles={tiles} onPick={(id) => navigate(`/map/lga/${id}`)} title={`Local governments of ${data.state.name}`} />
            </Card>

            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">House of Representatives ({data.reps.length})</h2>
              <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
                {data.reps.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <Link to={`/map/constituency/${r.constituencyId}`} className="text-sm font-medium underline-offset-2 hover:underline">
                      {r.constituencyName}
                    </Link>
                    <Link to={`/seats/${r.id}`} aria-label={`Rep for ${r.constituencyName}`}>
                      <HolderLine holder={r.holder} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
