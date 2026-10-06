import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getState } from '@avm/data';
import { ApiError, gameApi, type ConstituencyMap } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Card } from '../components/ui';
import { Breadcrumbs, HolderLine, SeatLink } from '../components/seats';

export function ConstituencyScreen() {
  const { id = '' } = useParams();
  const [data, setData] = useState<ConstituencyMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    gameApi
      .constituencyMap(id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this constituency.'));
  }, [id]);

  const state = data ? getState(data.constituency.stateCode) : undefined;
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          items={[{ to: '/map', label: 'Nigeria' }, ...(state ? [{ to: `/map/${state.code}`, label: state.name }] : []), { label: data?.constituency.name ?? 'Constituency' }]}
        />
        {error && <Alert>{error}</Alert>}
        {!data && !error && <p role="status">Loading…</p>}
        {data && (
          <>
            <Card className="flex flex-col gap-3">
              <div>
                <h1 className="text-2xl font-bold">{data.constituency.name}</h1>
                <p className="text-sm opacity-75">
                  Federal constituency · population {data.constituency.population.toLocaleString('en-NG')} · wealth {data.constituency.wealth}/100
                </p>
              </div>
              <SeatLink seat={data.rep} label="Member, House of Representatives" />
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Senate</h2>
              {data.senators.map((s) => (
                <SeatLink key={s.id} seat={s} label={`Senator, ${s.districtName}`} />
              ))}
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Local governments</h2>
              <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
                {data.lgas.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <Link to={`/map/lga/${l.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                      {l.name}
                      {l.share < 1 && <span className="opacity-70"> (part)</span>}
                    </Link>
                    {l.chairman && (
                      <Link to={`/seats/${l.chairman.id}`} aria-label={`Chairman of ${l.name}`}>
                        <HolderLine holder={l.chairman.holder} />
                      </Link>
                    )}
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
