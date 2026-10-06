import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATE_GRID } from '@avm/data';
import { ApiError, gameApi, type CountryMap } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Card } from '../components/ui';
import { PartyLegend, TileMap, VACANT_COLOR, type Tile } from '../components/seats';

export function MapScreen() {
  const [map, setMap] = useState<CountryMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    gameApi
      .countryMap()
      .then(setMap)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the map.'));
  }, []);

  const colorOf = (code: string | null | undefined) => map?.parties.find((p) => p.code === code)?.color ?? VACANT_COLOR;
  const tiles: Tile[] =
    map?.states.map((s) => {
      const cell = STATE_GRID[s.code] ?? { col: 0, row: 0 };
      // FCT has no governor; it is coloured by the party holding most of its seats
      const party = s.isFct ? s.leadingParty : s.governor?.party?.code;
      const who = s.isFct ? `most seats: ${s.leadingParty ?? 'none'}` : s.governor ? `Governor ${s.governor.name} (${s.governor.party?.code ?? 'no party'})` : 'Governor: vacant';
      return { key: s.code, col: cell.col, row: cell.row, label: s.code, ariaLabel: `${s.name}: ${who}`, color: colorOf(party) };
    }) ?? [];

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Map of Nigeria</h1>
        {error && <Alert>{error}</Alert>}
        {!map && !error && <p role="status">Loading the map…</p>}
        {map && (
          <Card className="flex flex-col gap-4">
            <p className="text-sm opacity-80">Tap a state to see its governor, senators, reps and local governments. Colours show the governor&apos;s party.</p>
            <TileMap tiles={tiles} onPick={(code) => navigate(`/map/${code}`)} title="States of Nigeria" />
            <PartyLegend parties={map.parties.filter((p) => p.code !== 'IND')} />
            <p className="text-xs opacity-60">Stylised tile map: each square is one state, placed roughly where it lies. Not to scale.</p>
          </Card>
        )}
      </div>
    </Page>
  );
}
