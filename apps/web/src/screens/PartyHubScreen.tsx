import { useEffect, useState } from 'react';
import { formatNaira } from '@avm/engine';
import { gameApi, type PartyInfo } from '../api/client';
import { Page } from '../components/Layout';
import { Alert, Button, Card } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useGame } from '../store/game';

export function PartyHubScreen() {
  const { profile, load } = useGame();
  const [parties, setParties] = useState<PartyInfo[] | null>(null);
  const { busy, notice, run } = useAction();

  const refresh = async () => setParties((await gameApi.parties()).parties);
  useEffect(() => {
    void refresh();
  }, []);

  const current = profile?.party?.code;
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Party Hub</h1>
        {notice && <Alert kind={notice.kind === 'info' ? 'info' : notice.kind}>{notice.text}</Alert>}
        {!parties && <p role="status">Loading parties…</p>}
        {parties?.filter((p) => !p.isIndependent).map((p) => (
          <Card key={p.code} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: p.color }} />
                <h2 className="text-lg font-bold">
                  {p.name} ({p.code})
                </h2>
              </div>
              {current === p.code ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (await run(() => gameApi.leaveParty(), () => `You left ${p.name}.`)) await Promise.all([load(), refresh()]);
                  }}
                >
                  Leave
                </Button>
              ) : (
                <Button
                  disabled={busy || !!current}
                  onClick={async () => {
                    if (await run(() => gameApi.joinParty(p.code), () => `Welcome to ${p.name}!`)) await Promise.all([load(), refresh()]);
                  }}
                >
                  Join
                </Button>
              )}
            </div>
            <p className="text-sm italic opacity-80">“{p.slogan}”</p>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs opacity-70">Seats held</dt>
                <dd className="font-semibold">{p.seatsHeld}</dd>
              </div>
              <div>
                <dt className="text-xs opacity-70">Player members</dt>
                <dd className="font-semibold">{p.playerMembers}</dd>
              </div>
              <div>
                <dt className="text-xs opacity-70">Treasury</dt>
                <dd className="font-semibold">{formatNaira(p.treasury)}</dd>
              </div>
            </dl>
          </Card>
        ))}
        {current && <p className="text-xs opacity-70">Leaving a party means you must wait before joining another.</p>}
      </div>
    </Page>
  );
}
