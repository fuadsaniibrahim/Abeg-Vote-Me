import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getState } from '@avm/data';
import { ApiError, gameApi, type LgaMap } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Card } from '../components/ui';
import { Breadcrumbs, HolderLine, SeatLink } from '../components/seats';

export function LgaScreen() {
  const { id = '' } = useParams();
  const [data, setData] = useState<LgaMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    gameApi
      .lgaMap(id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this LGA.'));
  }, [id]);

  const state = data ? getState(data.lga.stateCode) : undefined;
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ to: '/map', label: 'Nigeria' }, ...(state ? [{ to: `/map/${state.code}`, label: state.name }] : []), { label: data?.lga.name ?? 'LGA' }]} />
        {error && <Alert>{error}</Alert>}
        {!data && !error && <p role="status">Loading…</p>}
        {data && (
          <>
            <Card className="flex flex-col gap-3">
              <div>
                <h1 className="text-2xl font-bold">{data.lga.name} LGA</h1>
                <p className="text-sm opacity-75">
                  Population {data.lga.population.toLocaleString('en-NG')} · wealth {data.lga.wealth}/100{data.lga.isCapital ? ' · state capital' : ''}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                  {data.constituencies.map((c) => (
                    <Link key={c.id} to={`/map/constituency/${c.id}`} className="underline underline-offset-2">
                      {c.name} constituency
                    </Link>
                  ))}
                  {data.district && <span className="opacity-75">{data.district.name} senatorial district</span>}
                </p>
              </div>
              <SeatLink seat={data.chairman} label="LG Chairman" />
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="font-semibold">Wards ({data.wards.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs opacity-70">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Ward</th>
                      <th className="py-1 pr-2 font-medium">Councillor</th>
                      <th className="py-1 font-medium">Ward chairman</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/10">
                    {data.wards.map((w) => (
                      <tr key={w.id}>
                        <th scope="row" className="py-2 pr-2 font-medium">
                          Ward {w.number}
                        </th>
                        <td className="py-2 pr-2">
                          {w.councillor && (
                            <Link to={`/seats/${w.councillor.id}`} aria-label={`Councillor, ${w.name}`}>
                              <HolderLine holder={w.councillor.holder} />
                            </Link>
                          )}
                        </td>
                        <td className="py-2">
                          {w.wardChairman && (
                            <Link to={`/seats/${w.wardChairman.id}`} aria-label={`Ward chairman, ${w.name}`}>
                              <HolderLine holder={w.wardChairman.holder} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
